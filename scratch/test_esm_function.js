import { handler } from '../netlify/functions/cuitPadron.js';

async function main() {
  const event = {
    httpMethod: 'GET',
    queryStringParameters: { cuit: '27319516277' },
    path: '/.netlify/functions/cuitPadron'
  };

  const res = await handler(event);
  console.log("Status:", res.statusCode);
  console.log("Body:", res.body);
}

main();
