document.addEventListener('DOMContentLoaded', async () => {
  const connectWalletButton = document.getElementById('connect-wallet');
  const connectedWalletInfo = document.getElementById('connected-wallet-info');
  const disconnectButton = document.getElementById('disconnect');
  const addressLabel = document.getElementById('address');
  const payAmountInput = document.getElementById('pay-amount');
  const receiveAmountElement = document.getElementById('receive-amount');
  const receiveUsdElement = document.getElementById('receive-usd');
  const continueButton = document.getElementById('continue-button');
  const inputScreen = document.getElementById('input-screen');
  const onrampScreen = document.getElementById('onramp-screen');
  const backButton = document.getElementById('back-button');
  const onrampIframe = document.getElementById('onramp-iframe');

  const HALLIDAY_API_KEY = '_your_api_key_here_';
  const inputAsset = 'usd';
  const outputAsset = 'story:0x';
  const radioButtons = [];
  const onramps = [ 'stripe', 'transak', 'moonpay' ];
  const fiatOnrampPayInMethods = [ 'CREDIT_CARD' ];
  const quotes = {};
  let userAddress;

  if (!HALLIDAY_API_KEY || HALLIDAY_API_KEY === '_your_api_key_here_') {
    alert('HALLIDAY_API_KEY is missing!');
  }

  if (!window.ethereum) {
    alert('No EIP-1193 compliant wallet available. Install MetaMask to continue.');
    return;
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

  function updateContinueButton() {
    const outTokenAmount = parseFloat(receiveAmountElement.innerText) || 0;
    const isAmountValid = outTokenAmount > 0;

    if (isAmountValid && userAddress) {
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
        f?.issues?.[0]?.message?.includes('Given amount is') &&
        f?.issues?.[0]?.source &&
        !quotes?.[f.issues?.[0]?.source]?.price
      ) {
        const issue = f.issues[0];
        const onramp = issue.source;
        quotes[onramp].price = `Error: ${issue.message}`;
        quotes[onramp].expiration = expiration;
      }
    });
  }

  async function acceptQuote() {
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
        owner_address: userAddress,
        destination_address: userAddress
      })
    });

    const data = await res.json();
    console.log('acceptQuote', data);
    return data;
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
      // Get a quote in its own function
      await getQuote(value);
      // Set input using a function that checks the radio button
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

    let confirmResult = await acceptQuote();
    const paymentId = confirmResult.payment_id;

    // Handle user verification if required (>= $300 owner verify, >= $1M withdrawal sim)
    // Loop to handle up to two verification round-trips
    while (confirmResult.next_instruction?.type === 'USER_VERIFY') {
      const { verification_token, verifications } = confirmResult.next_instruction;
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();

      const signatures = await Promise.all(
        verifications.map(async (v) => {
          let signature;
          if (v.signature_type === 'EIP712') {
            const typedData = JSON.parse(v.payload);
            const { EIP712Domain, ...types } = typedData.types;
            signature = await signer.signTypedData(typedData.domain, types, typedData.message);
          } else {
            signature = await signer.signMessage(v.payload);
          }
          return { reason: v.reason, signature };
        })
      );

      // Submit verification signatures to confirm endpoint
      const verifyRes = await fetch('https://v2.prod.halliday.xyz/payments/confirm', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + HALLIDAY_API_KEY,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ verification_token, signatures })
      });

      if (verifyRes.status === 409) {
        // Already confirmed — treat as success and break
        break;
      } else if (verifyRes.status === 400) {
        // Quote expired or invalid — re-quote from scratch
        alert('Quote expired. Please try again.');
        continueButton.classList.remove('loading');
        updateQuote();
        return;
      } else if (verifyRes.status === 401) {
        // Signature verification failed — retry same verification round
        console.warn('Signature verification failed, retrying...');
        continue;
      }

      confirmResult = await verifyRes.json();
    }

    const onrampUrl = confirmResult.next_instruction.funding_page_url;

    paymentStatusInterval = setInterval(async () => {
      console.log('payment status:', paymentId, await getPaymentStatus(paymentId));
    }, 5000);

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

  connectWalletButton.addEventListener('click', async () => {
    try {
      const accounts = await ethereum.request({ method: 'eth_requestAccounts' });
      userAddress = accounts[0];
      addressLabel.innerText = userAddress;
      connectWalletButton.classList.add('hidden');
      connectedWalletInfo.classList.remove('hidden');
      updateContinueButton();
    } catch(e) {
      console.error(e);
    }
  });

  disconnectButton.addEventListener('click', async () => {
    await ethereum.request({
      method: 'wallet_revokePermissions',
      params: [{ eth_accounts: {} }]
    });
    userAddress = undefined;
    connectWalletButton.classList.remove('hidden');
    connectedWalletInfo.classList.add('hidden');
    updateContinueButton();
  });

  payAmountInput.addEventListener('input', updateQuote);
  continueButton.addEventListener('click', onContinueButtonClick);
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
  const queryWallet = await ethereum.request({ method: 'eth_accounts' });
  const alreadyConnected = queryWallet.length !== 0;

  if (alreadyConnected) {
    connectWalletButton.classList.add('hidden');
    connectedWalletInfo.classList.remove('hidden');
    userAddress = queryWallet[0];
    addressLabel.innerText = userAddress;
  } else {
    connectWalletButton.classList.remove('hidden');
    connectedWalletInfo.classList.add('hidden');
  }

  resetQuoteCache();
  updateContinueButton();
  payAmountInput.focus();
});