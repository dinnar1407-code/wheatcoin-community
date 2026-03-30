const txHash = 'R9HcbfPJcbfZsAoLx6dttYYRjgabkro9hbiVvkB6xBRxz2VRYhTERArYMtt6waDdFFwyYcUSDJXbXxHYL4i6Sgu';
const rpcUrl = 'https://api.mainnet-beta.solana.com';

async function test() {
    const response = await fetch(rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'getTransaction',
            params: [txHash, { encoding: 'jsonParsed', maxSupportedTransactionVersion: 0 }]
        })
    });
    const data = await response.json();
    console.log(JSON.stringify(data, null, 2));
}
test();
