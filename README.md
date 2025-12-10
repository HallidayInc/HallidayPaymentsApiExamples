# Halliday Payments API Examples

Code examples for implementing [Halliday Payments](https://docs.halliday.xyz) through the v2 API.

Onramp to any token on any chain. Swap to any token, even across chains. See `/examples/`.

## How to Run

Install [Node.js](https://nodejs.org/en/download). Run the following commands in the terminal.

```bash
git clone https://github.com/HallidayInc/HallidayPaymentsApiExamples.git
cd HallidayPaymentsApiExamples/
npm install
npm start
```

Make sure you set your Halliday API key in the JS files! See both `onramp.js` and `swap.js` in `examples/`.

```js
const HALLIDAY_API_KEY = '_your_api_key_here_';
```

## View examples in the web browser

Once the local server app is running in the terminal the following examples can be viewed in the browser.

### Onramp and swap examples

- `./examples/onramp.js` at http://localhost:8000/onramp.html
- `./examples/swap.js` at http://localhost:8000/swap.html

### Payment recovery examples

- `./examples/withdraw.js` at http://localhost:8000/withdraw.html
- `./examples/retry.js` at http://localhost:8000/retry.html
