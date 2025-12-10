const express = require('express');
const port = 8000;
const app = express();
app.use(express.static('./examples'));
app.listen(port, () => {
  console.log('Halliday Payments example apps that use the API');
  console.log(`\nOnramp to a token: \nhttp://localhost:${port}/onramp.html`);
  console.log(`\nSwap (single or cross-chain): \nhttp://localhost:${port}/swap.html`);
  console.log(`\nWithdraw (stuck tokens): \nhttp://localhost:${port}/withdraw.html`);
  console.log(`\nRetry a failed payment: \nhttp://localhost:${port}/retry.html`);
});
