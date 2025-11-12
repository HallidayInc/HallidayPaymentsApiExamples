document.addEventListener('DOMContentLoaded', async () => {
  const connectWalletButton = document.getElementById('connect-wallet');
  const connectedWalletInfo = document.getElementById('connected-wallet-info');
  const disconnectButton = document.getElementById('disconnect');
  const addressLabel = document.getElementById('address');
  const inputAvailableElement = document.getElementById('input-available');
  const amountInput = document.getElementById('amount-input');
  const continueButton = document.getElementById('continue-button');
  const receiveUsdElement = document.getElementById('receive-usd');
  const receiveAmountElement = document.getElementById('receive-amount');
  const backButton = document.getElementById('back-button');
  const inputScreen = document.getElementById('input-screen');
  const swapScreen = document.getElementById('swap-screen');
  const lastUpdateText = document.getElementById('last-update');
  const paymentIdText = document.getElementById('payment-id');
  const swapStepsList = document.getElementById('swap-steps-list');
  const swapStatusText = document.getElementById('swap-status');
  const swapContextText = document.getElementById('swap-context');
  const swapLoadingSpinner = document.getElementById('swap-loading-spinner');
  const erc20Abi = [
    'function balanceOf(address) view returns (uint256)',
    'function decimals() view returns (uint8)',
    'function transfer(address to, uint256 amount) returns (bool)',
  ];

  const fromChainId = '0x2105'; // Base mainnet
  const inputTokenAddress = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'; // USDC on Base
  const HALLIDAY_API_KEY = '_your_api_key_here_';
  const inputAsset = 'base:' + inputTokenAddress;
  const outputAsset = 'story:0x';
  let quote = {};
  let walletBalance;
  let userAddress;

  if (!HALLIDAY_API_KEY || HALLIDAY_API_KEY === '_your_api_key_here_') {
    alert('HALLIDAY_API_KEY is missing!');
  }

  if (!window.ethereum) {
    alert('No EIP-1193 compliant wallet available. Install MetaMask to continue.');
    return;
  }

  async function getErc20Balance(addressToGetbalanceOf, ethersContract) {
    const [ balance, decimals ] = await Promise.all([
      ethersContract.balanceOf(addressToGetbalanceOf),
      ethersContract.decimals()
    ]);
    return [ balance, decimals ];
  }

  async function showWalletBalanceOfInputToken(address) {
    const currentChainId = await ethereum.request({ method: 'eth_chainId' });
    if (currentChainId !== fromChainId) {
      await ethereum.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: fromChainId }]
      });
    }
    const provider = new ethers.BrowserProvider(window.ethereum);
    const inputTokenContract = new ethers.Contract(inputTokenAddress, erc20Abi, provider);
    const [ balance, decimals ] = await getErc20Balance(address, inputTokenContract);
    const formattedBalance = ethers.formatUnits(balance, decimals);
    inputAvailableElement.innerText = `Available in Wallet: ${formattedBalance}`;
    walletBalance = formattedBalance;
  }

  function resetQuoteCache() {
      quote = {
        outputAmount: '0',
        inputAmount: '0',
        expiration: new Date(0)
      };
  }

  function validateAmountInput(value) {
    return /^[0-9]*\.?[0-9]*$/.test(value);
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
            amount: inputAmount
          },
          output_asset: outputAsset
        },
        price_currency: 'USD'
      })
    });

    const data = await res.json();
    console.log('getQuote', data);

    resetQuoteCache();

    const expiration = new Date(data.accept_by);
    const stateToken = data.state_token;
    data.quotes.forEach((quoteData, i) => {
      console.log(quoteData, i);
      const paymentId = quoteData.payment_id;
      const outputAmount = quoteData.output_amount.amount;
      const price = (inputAmount / outputAmount).toString();
      const _quote = {
        stateToken,
        paymentId,
        outputAmount,
        inputAmount,
        expiration,
        price,
      };

      // Optimize for the lowest onramp price quoted
      const oldExpiration = _quote.expiration;
      const oldPrice = _quote.price;
      if (
        expiration >= oldExpiration ||
        (expiration >= oldExpiration && price <= oldPrice)
      ) {
        quote = _quote;
      }
    });

    data.failures.forEach((f, i) => {
      console.log(f, i);
    });
  }

  async function acceptQuote() {
    try {
      const requestBody = {
        payment_id: quote.paymentId,
        state_token: quote.stateToken,
        owner_address: userAddress,
        destination_address: userAddress
      };

      const res = await fetch('https://v2.prod.halliday.xyz/payments/confirm', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + HALLIDAY_API_KEY,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
      });

      const data = await res.json();

      if (!res.ok) {
        throw Error(JSON.stringify(data));
      }

      console.log('acceptQuote', data);
      return data;
    } catch(e) {
      console.error('acceptQuote error', e);
      console.log('requestBody', requestBody);
    }
  }

  async function getSwapStatus(paymentId) {
    try {
      const res = await fetch('https://v2.prod.halliday.xyz/payments' +
        `?payment_id=${paymentId}`, {
        method: 'GET',
        headers: {
          'Authorization': 'Bearer ' + HALLIDAY_API_KEY,
          'Content-Type': 'application/json'
        }
      });

      const data = await res.json();

      if (!res.ok) {
        throw Error(JSON.stringify(data));
      }

      console.log('getSwapStatus', data);
      return data;
    } catch(e) {
      console.error('getSwapStatus error', e);
    }
  }

  function updateContinueButton() {
    const outTokenAmount = parseFloat(receiveAmountElement.innerText) || 0;
    const isAmountValid = outTokenAmount > 0;
    
    if (isAmountValid) {
      continueButton.disabled = false;
      continueButton.classList.add('enabled');
    } else {
      continueButton.disabled = true;
      continueButton.classList.remove('enabled');
    }
  }

  function setUpdatedOutputAmount() {
    receiveAmountElement.textContent = (+quote.outputAmount).toFixed(6);
    if (isNaN(+quote.price)) {
      receiveUsdElement.textContent = quote.price;
    } else {
      receiveUsdElement.textContent = `$${(+quote.price).toFixed(2)} per token`;
    }
    updateContinueButton();
  }

  let loadingTimeout;
  function updateQuote() {
    const value = amountInput.value;
    if (!validateAmountInput(value) || value == 0) {
      amountInput.value = value.slice(0, -1);
      return;
    }

    if (!!walletBalance && +value > +walletBalance) {
      amountInput.classList.add('red-text');
    } else {
      amountInput.classList.remove('red-text');
    }
    
    continueButton.classList.add('loading');
    continueButton.classList.remove('enabled');
    clearTimeout(loadingTimeout);

    loadingTimeout = setTimeout(async () => {
      // Get a quote in own function
      await getQuote(value);
      console.log(value, quote);
      // Set input using a function that checks the radio
      setUpdatedOutputAmount();
      continueButton.classList.remove('loading');
      loadingTimeout = undefined;
      updateContinueButton();
    }, 2000);
  }

  async function showSwapStatus(swapData) {
    const status = await getSwapStatus(swapData.payment_id);

    try {
      lastUpdateText.innerText = status.updated_at;
      swapStatusText.innerText = status.status;

      if (status.status === 'COMPLETE') {
        swapContextText.innerText = `Complete! Check the address on the destination chain for a transfer in of the additional output tokens.`;
        swapLoadingSpinner.classList.add('hidden');
      } else {
        swapContextText.innerText = `Check the browser console logs for more information`;
      }

      swapStepsList.innerHTML = '';
      for (let i = 0; i < status.fulfilled.route.length; i++) {
        const step = status.fulfilled.route[i];
        const _type = step.type;
        const _status = step.status;
        const li = document.createElement('li');
        li.textContent = _type + ': '+ _status;
        swapStepsList.appendChild(li);

        if (status.status === 'PENDING' && i === 0 && _status === 'PENDING') {
          const _fundAmount = status.quoted.route[0].net_effect.consume[0].amount;
          const _fundAddress = status.processing_addresses[0].address;
          swapContextText.innerText = `Pending means the processing address (${_fundAddress}) is waiting to be funded with ${_fundAmount} tokens.`;
        }
      }
    } catch(e) {
      console.error('Error showing the latest status in the UI', e, swapData, status);
    }
  }

  function onBackButtonClick() {
    swapScreen.classList.add('hidden');
    inputScreen.classList.remove('hidden');
    updateQuote();
  }

  async function onContinueButtonClick() {
    if (!continueButton.classList.contains('enabled')) {
      return;
    }

    continueButton.classList.add('loading');
    continueButton.classList.remove('enabled');

    let swapData;
    try {
      swapData = await acceptQuote();
      // Poll status and show it in the UI
      setInterval(async () => {
        showSwapStatus(swapData);
      }, 5000);
      showSwapStatus(swapData);
    } catch(e) {
      console.error('Error accepting quote', e);
    }

    continueButton.classList.remove('loading');
    swapLoadingSpinner.classList.remove('hidden');
    inputScreen.classList.add('hidden');
    swapScreen.classList.remove('hidden');

    let fundAmount, fundAddress;
    try {
      fundAmount = swapData.quoted.route[0].net_effect.consume[0].amount;
      fundAddress = swapData.processing_addresses[0].address;
      lastUpdateText.innerText = swapData.updated_at;
      paymentIdText.innerText = swapData.payment_id;
      swapStatusText.innerText = swapData.status;
    } catch(e) {
      console.error('Malformed swap data', e, swapData);
    }

    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const inputTokenWithSigner = new ethers.Contract(inputTokenAddress, erc20Abi, signer);
      const decimals = await inputTokenWithSigner.decimals();

      const tx = await inputTokenWithSigner.transfer(
        fundAddress,
        ethers.parseUnits(fundAmount, decimals)
      );
      await tx.wait();
    } catch(e) {
      console.error('Error with funding the workflow', e);
    }
  }

  connectWalletButton.addEventListener('click', async () => {
    try {
      const accounts = await ethereum.request({ method: 'eth_requestAccounts' });
      userAddress = accounts[0];
      addressLabel.innerText = userAddress;
      connectWalletButton.classList.add('hidden');
      connectedWalletInfo.classList.remove('hidden');
      await showWalletBalanceOfInputToken(userAddress);
    } catch(e) {
      console.error(e);
    }
  });

  disconnectButton.addEventListener('click', async () => {
    await ethereum.request({
      method: 'wallet_revokePermissions',
      params: [{ eth_accounts: {} }]
    });
    connectWalletButton.classList.remove('hidden');
    connectedWalletInfo.classList.add('hidden');
    inputAvailableElement.innerText = 'Available in Wallet: -';
    walletBalance = 0;
  });

  amountInput.addEventListener('input', updateQuote);
  continueButton.addEventListener('click', onContinueButtonClick);
  backButton.addEventListener('click', onBackButtonClick);

  // Update quote after a shown quote expires
  setInterval(() => {
    if (
      !loadingTimeout &&
      amountInput.value &&
      (quote.expiration && quote.expiration < Date.now())
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
    await showWalletBalanceOfInputToken(userAddress);
  } else {
    connectWalletButton.classList.remove('hidden');
    connectedWalletInfo.classList.add('hidden');
  }
});