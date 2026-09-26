const { handler } = require('../netlify/functions/cuitPadron.js');

async function testLocalFunction() {
  const event = {
    httpMethod: 'GET',
    queryStringParameters: { cuit: '27319516277' },
    path: '/.netlify/functions/cuitPadron'
  };

  const res = await handler(event);
  console.log("Function Status:", res.statusCode);
  console.log("Function Body:", res.body);
}

testLocalFunction();
