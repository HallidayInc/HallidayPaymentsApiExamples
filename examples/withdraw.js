document.addEventListener('DOMContentLoaded', async () => {
  const connectWalletButton = document.getElementById('connect-wallet');
  const connectedWalletInfo = document.getElementById('connected-wallet-info');
  const disconnectButton = document.getElementById('disconnect');
  const addressLabel = document.getElementById('address');
  const backButton = document.getElementById('back-button');
  const selectionScreen = document.getElementById('selection-screen');
  const signingScreen = document.getElementById('signing-screen');
  const historyLoadingSpinner = document.getElementById('history-loading-spinner');
  const transactionHistoryItemsContainer = document.getElementById('transaction-history-items');
  const paymentInformationContainer = document.getElementById('payment-information-container');
  const withdrawalOptionsContainer = document.getElementById('withdrawal-options-container');

  const HALLIDAY_API_KEY = '_your_api_key_here_';
  let userAddress;
  let supportedAssets;
  let supportedChains;

  if (!HALLIDAY_API_KEY || HALLIDAY_API_KEY === '_your_api_key_here_') {
    alert('HALLIDAY_API_KEY is missing!');
  }

  if (!window.ethereum) {
    alert('No EIP-1193 compliant wallet available. Install MetaMask to continue.');
    return;
  }

  async function getSupportedAssets() {
    try {
      const res = await fetch(
        'https://v2.prod.halliday.xyz/assets',
        {
          method: 'GET',
          headers: {
            'Authorization': 'Bearer ' + HALLIDAY_API_KEY,
            'Content-Type': 'application/json'
          }
        }
      );

      const data = await res.json();

      if (!res.ok) {
        throw Error(JSON.stringify(data));
      }

      return data;
    } catch(e) {
      console.error('getSupportedAssets error', e);
    }
  }

  async function getSupportedChains() {
    try {
      const res = await fetch(
        'https://v2.prod.halliday.xyz/chains',
        {
          method: 'GET',
          headers: {
            'Authorization': 'Bearer ' + HALLIDAY_API_KEY,
            'Content-Type': 'application/json'
          }
        }
      );

      const data = await res.json();

      if (!res.ok) {
        throw Error(JSON.stringify(data));
      }

      return data;
    } catch(e) {
      console.error('getSupportedChains error', e);
    }
  }

  async function getWalletPaymentHistory(address, paginationKey) {
    const params = new URLSearchParams({
      category: 'ALL',
      owner_address: address,
      ...(paginationKey && { pagination_key: paginationKey })
    });

    const res = await fetch(`https://v2.prod.halliday.xyz/payments/history?${params}`, {
      method: 'GET',
      headers: {
        'Authorization': 'Bearer ' + HALLIDAY_API_KEY,
        'Content-Type': 'application/json'
      }
    });

    // Note that only payments initialized with this HALLIDAY_API_KEY will be returned
    const data = await res.json();
    return data;
  }

  async function getProcessingAddressBalances(paymentId) {
    try {
      const res = await fetch(`https://v2.prod.halliday.xyz/payments/balances`, {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + HALLIDAY_API_KEY,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ payment_id: paymentId })
      });

      const data = await res.json();
      return data;
    } catch (e) {
      console.error('getProcessingAddressBalances error', e);
    }
  }

  async function getTypedData(withdrawToAddress, paymentId, token, amount) {
    try {
      const res = await fetch(`https://v2.prod.halliday.xyz/payments/withdraw`, {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + HALLIDAY_API_KEY,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          payment_id: paymentId,
          token_amounts: [ { token, amount } ],
          recipient_address: withdrawToAddress,
        })
      });

      const data = await res.json();
      return data;
    } catch (e) {
      console.error('getTypedData error', e);
    }
  }

  async function confirmWithdrawal(withdrawToAddress, paymentId, token, amount, signature) {
    try {
      const res = await fetch(`https://v2.prod.halliday.xyz/payments/withdraw/confirm`, {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + HALLIDAY_API_KEY,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          payment_id: paymentId,
          token_amounts: [ { token, amount } ],
          recipient_address: withdrawToAddress,
          owner_signature: signature
        })
      });

      const data = await res.json();
      return data.transaction_hash;
    } catch (e) {
      console.error('confirmWithdrawal error', e);
    }
  }

  async function showErringPayments(_userAddress) {
    transactionHistoryItemsContainer.innerHTML = '';
    historyLoadingSpinner.classList.remove('hidden');

    // Use this code to fetch the full payment history of the owner
    /*

    const payments = [];
    let paginationKey;
    do {
      const history = await getWalletPaymentHistory(_userAddress, paginationKey);
      if (history.next_pagination_key) {
        paginationKey = history.next_pagination_key;
      } else {
        paginationKey = undefined;
      }
      payments.push(...history.payment_statuses);
    } while (paginationKey)

    */

    const numPaymentsToFetch = 10;
    const history = await getWalletPaymentHistory(_userAddress);
    const payments = history.payment_statuses.slice(0, numPaymentsToFetch);

    for (let i = 0; i < payments.length; i++) {
      const payment = payments[i];

      if (payment.status === 'COMPLETE') continue;

      const balances = await getProcessingAddressBalances(payment.payment_id);
      const amount = balances.balance_results.reduce((sum, item) => sum + +item.value.amount, 0);

      if (amount === 0) continue;

      const type = payment.quoted.route[0].type === 'USER_FUND' ? 'Swap' : 'Onramp';
      const input = type === 'Onramp' ?
        payment.quoted.route[0].net_effect.consume[0].resource.asset.toUpperCase() :
        supportedAssets[payment.quoted.route[0].net_effect.consume[0].resource.asset].symbol;
      const output = supportedAssets[payment.quoted.output_amount.asset].symbol;
      const onramp = payment.quoted.onramp;
      const provider = onramp ? onramp[0].toUpperCase() + onramp.slice(1) : 'Halliday';
      const time = new Date(payment.created_at).toLocaleString();
      const status = payment.status;

      const li = document.createElement('li');
      li.innerHTML = `
        <div class="transaction-info">
          <div class="transaction-row">
            <span class="transaction-type">${type} (${status})</span>
          </div>
          <div class="transaction-route">${input} -> ${output} via ${provider}</div>
          <div class="transaction-stuck">Stuck: ${amount}</div>
          <div class="transaction-time">${time}</div>
        </div>
        <button class="small-button">Withdraw</button>
      `;

      li.querySelector('.small-button').addEventListener('click', async () => {
        console.log('withdraw: id', payment.payment_id, 'payment', payment, 'balances', balances);
        const paymentInfo = { paymentId: payment.payment_id, type, status, input, output, provider, amount, time }
        displaySigningPage(paymentInfo, balances);
      });

      transactionHistoryItemsContainer.appendChild(li);
      historyLoadingSpinner.classList.add('hidden');
    }
    historyLoadingSpinner.classList.add('hidden');
  }

  function displaySigningPage(paymentInfo, balances) {
    const { paymentId, type, status, input, output, provider, amount, time } = paymentInfo;
    signingScreen.classList.remove('hidden');
    selectionScreen.classList.add('hidden');

    paymentInformationContainer.innerHTML = `
      <span class="payment-type">${type} (${status})</span>
      <span class="payment-route">${input} -> ${output} via ${provider}</span>
      <span class="payment-stuck">Stuck: ${amount}</span>
      <span class="payment-time">${time}</span>
    `;

    withdrawalOptionsContainer.innerHTML = '';
    for (let i = 0; i < balances.balance_results.length; i++) {
      const balance = balances.balance_results[i];
      const _amount = +balance.value.amount;
      if (_amount === 0) {
        continue;
      }

      const item = document.createElement('div');
      item.className = 'withdrawal-option-card';
      item.innerHTML = `
        <div class="token-name">${supportedAssets[balance.token].name}</div>
        <div class="token-amount">Amount stuck: ${_amount}</div>
        <div class="transaction">
          <a target="_blank" class="hidden" href="">See Withdraw Transaction</a>
        </div>
        <button class="small-button">Sign & Submit Withdrawal</button>
      `;

      const withdrawButton = item.querySelector('.small-button');
      withdrawButton.addEventListener('click', async () => {
        withdrawButton.classList.add('loading');

        // Fetch the withdraw signature data from the API
        const withdrawToAddress = userAddress; // user's connected wallet
        const typedDataToSign = await getTypedData(withdrawToAddress, paymentId, balance.token, balance.value.amount);
        const { domain, types, message } = JSON.parse(typedDataToSign.withdraw_authorization);
        delete types.EIP712Domain;

        // Sign the withdraw transaction using Ethers
        const provider = new ethers.BrowserProvider(window.ethereum);
        const signer = await provider.getSigner();
        const signature = await signer.signTypedData(domain, types, message);

        // Send signature to API to be posted onchain
        const txHash = await confirmWithdrawal(withdrawToAddress, paymentId, balance.token, balance.value.amount, signature);

        // Show the resulting withdraw transaction on the proper block explorer
        const chain = balance.token.split(':')[0];
        const { explorer } = supportedChains[chain];
        const link = item.querySelector('a');
        link.setAttribute('href', `${explorer}tx/${txHash}`);
        link.classList.remove('hidden');

        withdrawButton.disabled = true;
        withdrawButton.classList.remove('loading');
      });

      withdrawalOptionsContainer.appendChild(item);
    }
  }

  function onBackButtonClick() {
    signingScreen.classList.add('hidden');
    selectionScreen.classList.remove('hidden');
  }

  connectWalletButton.addEventListener('click', async () => {
    try {
      const accounts = await ethereum.request({ method: 'eth_requestAccounts' });
      userAddress = accounts[0];
      addressLabel.innerText = userAddress;
      connectWalletButton.classList.add('hidden');
      connectedWalletInfo.classList.remove('hidden');
      await showErringPayments(userAddress);
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
  });

  backButton.addEventListener('click', onBackButtonClick);

  // Initialize
  const queryWallet = await ethereum.request({ method: 'eth_accounts' });
  const alreadyConnected = queryWallet.length !== 0;

  // Cache supported asset information
  supportedAssets = await getSupportedAssets();
  supportedChains = await getSupportedChains();

  if (alreadyConnected) {
    connectWalletButton.classList.add('hidden');
    connectedWalletInfo.classList.remove('hidden');
    userAddress = queryWallet[0];
    addressLabel.innerText = userAddress;
    await showErringPayments(userAddress);
  } else {
    connectWalletButton.classList.remove('hidden');
    connectedWalletInfo.classList.add('hidden');
  }
});
