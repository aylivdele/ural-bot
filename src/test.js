const LocalDatabase = require('./db');
const TelegramBot = require('node-telegram-bot-api');

require('dotenv').config()


const db = new LocalDatabase();
const token = process.env.API_TOKEN

setTimeout(() => {
    db.updateOrInsertChatState(123, 123)
    console.log(db.getChatState(123))
}, 1000)