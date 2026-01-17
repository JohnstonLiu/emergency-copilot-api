import express from 'express';
import cors from 'cors';
import { PORT, OVERSHOOT_API_KEY } from './config/env';
import catchErrors from './middleware/catchErrors';

const app = express();
const port = PORT;

app.get("/health", (req, res) => {
    res.send("Server is running");
});

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(catchErrors);

app.listen(port, () => {
    console.log(`Server is running on port ${ port }`);
});