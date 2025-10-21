document.addEventListener('DOMContentLoaded', () => {
  const payAmountInput = document.getElementById('pay-amount');
  const receiveAmountElement = document.getElementById('receive-amount');
  const receiveUsdElement = document.getElementById('receive-usd');
  const termsCheckbox = document.getElementById('terms-checkbox');
  const continueButton = document.getElementById('continue-button');
  const addressInput = document.getElementById('address-input');
  const inputScreen = document.getElementById('input-screen');
  const onrampScreen = document.getElementById('onramp-screen');
  const backButton = document.getElementById('back-button');
  const onrampIframe = document.getElementById('onramp-iframe');

  const HALLIDAY_API_KEY = '_your_api_key_here_';
  const inputAsset = 'usd';
  const outputAsset = 'story:0x';
  let radioButtons = [];
  const onramps = [ 'stripe', 'transak', 'moonpay' ];
  const fiatOnrampPayInMethods = [ 'CREDIT_CARD' ];
  const quotes = {};

  if (!HALLIDAY_API_KEY || HALLIDAY_API_KEY === '_your_api_key_here_') {
    alert('HALLIDAY_API_KEY is missing!');
  }

  function resetQuoteCache() {
    onramps.forEach(onramp => {
      const radioButton = document.getElementById(onramp);
      radioButton.addEventListener('change', setUpdatedOutputAmount);
      radioButtons.push(radioButton);
      quotes[onramp] = {
        outputAmount: '0',
        inputAmount: '0',
        expiration: new Date(0)
      };
    });
  }

  function validateAmountInput(value) {
    return /^[0-9]*\.?[0-9]*$/.test(value);
  }

  function getSelectedOnramp() {
    let result;

    radioButtons.forEach((onrampRadioButton) => {
      if (onrampRadioButton.checked) {
        result = onrampRadioButton.value;
      }
    });

    return result;
  }

  function isValidEthAddress(addr) {
    return /^0x[a-fA-F0-9]{40}$/.test(addr);
  }

  function updateContinueButton() {
    const outTokenAmount = parseFloat(receiveAmountElement.innerText) || 0;
    const isAmountValid = outTokenAmount > 0;
    const areTermsAccepted = termsCheckbox.checked;
    const validAddress = isValidEthAddress(addressInput.value);
    
    if (isAmountValid && areTermsAccepted && validAddress) {
      continueButton.disabled = false;
      continueButton.classList.add('enabled');
    } else {
      continueButton.disabled = true;
      continueButton.classList.remove('enabled');
    }
  }

  async function getQuote(inputAmount) {
    const res = await fetch('https://v2.prod.halliday.xyz/payments/quotes', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + HALLIDAY_API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        request: {
          kind: 'FIXED_INPUT',
          fixed_input_amount: {
            asset: inputAsset,
            amount: inputAmount,
          },
          output_asset: outputAsset,
        },
        price_currency: 'usd',
        onramps,
        onramp_methods: fiatOnrampPayInMethods,
        customer_geolocation: { alpha3_country_code: 'USA' }
      }),
    });

    const data = await res.json();
    console.log('getQuote', data);

    resetQuoteCache();

    const expiration = new Date(data.accept_by);
    const stateToken = data.state_token;
    data.quotes.forEach((quoteData, i) => {
      const onramp = quoteData.onramp;
      const paymentId = quoteData.payment_id;
      const outputAmount = +quoteData.output_amount.amount;
      const prices = data.current_prices;
      const price = (inputAmount / outputAmount).toString();
      const fees = +quoteData.fees.total_fees;
      const quote = {
        onramp,
        stateToken,
        paymentId,
        outputAmount,
        inputAmount,
        expiration,
        price,
        fees,
        prices,
      };

      // Optimize for the highest output token amount quoted
      const oldExpiration = quotes[onramp].expiration;
      const oldOutputAmount = quotes[onramp].outputAmount;
      if (
        expiration > oldExpiration ||
        outputAmount >= oldOutputAmount
      ) {
        quotes[onramp] = quote;
      }
    });

    data.failures.forEach((f, i) => {
      if (
        f && f.issues && f.issues[0]
        && f.issues[0].message
        && f.issues[0].message.includes('Given amount is')
        && f.issues[0].source
        && quotes[f.issues[0].source]
        && !quotes[f.issues[0].source].price
      ) {
        const issue = f.issues[0];
        const onramp = issue.source;
        quotes[onramp].price = `Error: ${issue.message}`;
        quotes[onramp].expiration = expiration;
      }
    });
  }

  async function acceptQuote() {
    const destinationAddress = addressInput.value;
    const selectedQuote = quotes[getSelectedOnramp()];
    const res = await fetch('https://v2.prod.halliday.xyz/payments/confirm', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + HALLIDAY_API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        payment_id: selectedQuote.paymentId,
        state_token: selectedQuote.stateToken,
        owner_address: destinationAddress,
        destination_address: destinationAddress
      })
    });

    const data = await res.json();
    console.log('acceptQuote', data);
    return data.payment_id;
  }

  function setUpdatedOutputAmount() {
    const selectedOnramp = getSelectedOnramp();

    receiveAmountElement.textContent = (+quotes[selectedOnramp].outputAmount).toFixed(6);
    if (isNaN(+quotes[selectedOnramp].price)) {
      receiveUsdElement.textContent = quotes[selectedOnramp].price;
    } else {
      const price = (+quotes[selectedOnramp].price).toFixed(2);
      const aggPrice = (+quotes[selectedOnramp].prices[outputAsset]).toFixed(2);
      const fees = (+quotes[selectedOnramp].fees).toFixed(3);
      receiveUsdElement.innerHTML = `$${price} per token, Total fees $${fees}.<br />IP price $${aggPrice}.`;
    }
    updateContinueButton();
  }

  let loadingTimeout;
  function updateQuote() {
    const value = payAmountInput.value;
    if (!validateAmountInput(value) || value == 0) {
      payAmountInput.value = value.slice(0, -1);
      return;
    }
    
    continueButton.classList.add('loading');
    continueButton.classList.remove('enabled');
    clearTimeout(loadingTimeout);

    loadingTimeout = setTimeout(async () => {
      // Get a quote in own function
      await getQuote(value);
      // Set input using a function that checks the radio
      setUpdatedOutputAmount();
      continueButton.classList.remove('loading');
      loadingTimeout = undefined;
      updateContinueButton();
    }, 2000);
  }

  async function getPaymentStatus(paymentId) {
    const res = await fetch(`https://v2.prod.halliday.xyz/payments?payment_id=${paymentId}`, {
      method: 'GET',
      headers: {
        'Authorization': 'Bearer ' + HALLIDAY_API_KEY,
        'Content-Type': 'application/json'
      },
    });

    const data = await res.json();
    return data;
  }

  let paymentStatusInterval;
  async function onContinueButtonClick() {
    if (!continueButton.classList.contains('enabled')) {
      return;
    }

    continueButton.classList.add('loading');
    continueButton.classList.remove('enabled');

    const paymentId = await acceptQuote();
    paymentStatusInterval = setInterval(async () => {
      console.log('payment status:', paymentId, await getPaymentStatus(paymentId));
    }, 5000);

    // Use this URL for the native provider payment pages
    // const onrampUrl = `https://app.halliday.xyz/funding/${paymentId}`;

    // Use this URL for the Halliday provider payment handler page
    const onrampUrl = `https://app.halliday.xyz/payments/${paymentId}`;

    continueButton.classList.remove('loading');

    onrampIframe.src = onrampUrl;

    onrampScreen.classList.remove('hidden');
    inputScreen.classList.add('hidden');
  }

  function onBackButtonClick() {
    clearInterval(paymentStatusInterval);
    onrampScreen.classList.add('hidden');
    inputScreen.classList.remove('hidden');
    updateQuote();
  }

  payAmountInput.addEventListener('input', updateQuote);
  termsCheckbox.addEventListener('change', updateContinueButton);
  continueButton.addEventListener('click', onContinueButtonClick);
  addressInput.addEventListener('input', updateContinueButton);
  backButton.addEventListener('click', onBackButtonClick);

  // Update quote after a shown quote expires
  setInterval(() => {
    if (
      !loadingTimeout &&
      payAmountInput.value &&
      quotes[onramps[0]].expiration < Date.now()
    ) {
      updateQuote();
    }
  }, 1000);

  // Initialize
  resetQuoteCache();
  updateContinueButton();
  payAmountInput.focus();
});