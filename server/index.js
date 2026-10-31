'use strict';
const path = require('path');
const http = require('http');
const express = require('express');
const { Server } = require('socket.io');
const { attach } = require('./network');

const PORT = process.env.PORT || 3000;
// CORS_ORIGIN: čárkou oddělený seznam adres frontendu, pokud je hostován jinde (výchozí: povoleno vše)
const origin = process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',').map((s) => s.trim()) : '*';

const app = express();
app.disable('x-powered-by');
app.get('/health', (req, res) => res.json({ ok: true }));
app.use(express.static(path.join(__dirname, '..', 'public'), { maxAge: '1h' }));

const server = http.createServer(app);
const io = new Server(server, { cors: { origin }, pingInterval: 10000, pingTimeout: 15000 });
attach(io);

server.listen(PORT, () => console.log(`Kulečník server běží na portu ${PORT}`));
