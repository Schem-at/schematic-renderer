const express = require('express');
const request = require('request');

const app = express();

app.get('/proxy/minecraft-jar', (req, res) => {
  const jarURL = 'https://piston-data.mojang.com/v1/objects/fd19469fed4a4b4c15b2d5133985f0e3e7816a8a/client.jar';

  req.pipe(request(jarURL)).pipe(res);
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Proxy server listening on port ${port}`);
});