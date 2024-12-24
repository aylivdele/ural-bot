const LocalDatabase = require('./db');
const TelegramBot = require('node-telegram-bot-api');

require('dotenv').config()


const db = new LocalDatabase();
const token = process.env.API_TOKEN

const bot = new TelegramBot(token)