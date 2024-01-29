const { OpenAI } = require("openai");
import * as path from 'path';
import * as fs from 'fs';
import * as  express from 'express';
import * as  multer from 'multer';
import  * as  gTTS from "gtts"

const openai = new OpenAI({apiKey: process.env.OPENAI_API_KEY});

 let tokens = "";

const model = async (prompt) => {

    try {
        const response = await openai.chat.completions.create({
            model: "gpt-3.5-turbo",
            messages:[{role: 'system', content: prompt}],
            max_tokens: 1000,
        });

        const textToSpeak = response.choices[0].message.content;
        if (!textToSpeak) {
            throw new Error('No text was returned from the API');
        }

        io.emit('message', textToSpeak);

        const gtts = new gTTS(textToSpeak, 'en');
        let files = fs.readdirSync(path.join(__dirname, 'uploads'));
        const lastFile = files[files.length - 1];

        tokens += textToSpeak;

        gtts.save(path.join(__dirname, 'uploads', lastFile.replace(".mp3", "-gen.mp3")), function (err, result) {
            if (err) { throw new Error(err); }
            console.log("Text to speech converted!");
            io.emit('converted');
        });

        return response.choices[0];
    } catch (error) {
        console.error('Error fetching GPT response:', error);
    }
}

const storage = multer.diskStorage({
  destination(req, file, cb) {
    cb(null, 'uploads/');
  },

  filename(req, file, cb) {
    const fileNameArr = file.originalname.split('.');
    cb(null, `${Date.now()}.${fileNameArr[fileNameArr.length - 1]}`);
  },
});

const upload = multer({ storage });
const app = express();

const http = require('http').Server(app);
const io = require('socket.io')(http);

const port = process.env.PORT || 3000;

io.on('connection', (socket) => {
  console.log('user connected');

  socket.on('disconnect', () => {
      console.log('user disconnected');
    });
});

app.use(express.static('public/assets'));
app.use(express.static('uploads'));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/index.html'));
});

app.post('/record', upload.single('audio'), async (req, res) => {

  let files = fs.readdirSync(path.join(__dirname, 'uploads'));
  const lastFile = files[files.length - 1];

  const transcription = await transcribeAudio(lastFile);
  console.log('Transcription:', transcription);

   await model(transcription);

   const txtPath = path.join(__dirname, 'uploads', req.file.filename.replace(".mp3", "-prompt.txt"))
   fs.writeFileSync(txtPath, transcription);

   const responsePath = path.join(__dirname, 'uploads', req.file.filename.replace(".mp3", "-gen.txt"))
   fs.writeFileSync(responsePath, tokens);

   return res.json({ success: true })
}) 

app.get('/recordings', async (req, res) => {
  let filesTexts = fs.readdirSync(path.join(__dirname, 'uploads'));

  const files = filesTexts.filter((file) => {
    const fileNameArr = file.split('-');
    return fileNameArr[fileNameArr.length - 1] === 'gen.mp3';
  }).map((file) => `/${file}`);

  const prompts = filesTexts.filter((file) => {
    const fileNameArr = file.split('-');
    return fileNameArr[fileNameArr.length - 1] === 'prompt.txt';
  }).map((txt) => fs.readFileSync(path.join(__dirname, 'uploads', txt), 'utf8'));

  const responses = filesTexts.filter((file) => {
    const fileNameArr = file.split('-');
    return fileNameArr[fileNameArr.length - 1] === 'gen.txt';
  }).map((txt) => fs.readFileSync(path.join(__dirname, 'uploads', txt), 'utf8'));
  
  return res.json({ success: true, files, prompts, responses });
});

async function transcribeAudio(filename) {
  const transcript = await openai.audio.transcriptions.create(
      {
          file: fs.createReadStream(path.join(__dirname, 'uploads', filename)),
          model: "whisper-1"
      }
  );
  return transcript.text;
}

http.listen(port, () => {
  console.log(`App listening at http://localhost:${port}`);
});
