const https = require('https');

module.exports = class Request {
  errorTimeout = (reject, urlRequest) => () =>
    reject(new Error(`timeout at [${urlRequest}] :(`));

  raceTimeoutDelay(url, timeout) {
    return new Promise((resolve, reject) => {
      setTimeout(this.errorTimeout(reject, url), timeout);
    });
  }

  async get(url) {
    return new Promise((resolve, reject) => {
      https
        .get(url, (res) => {
          const items = [];
          res
            .on('data', (data) => {
              items.push(data);
            })
            .on('end', () => {
              const stringifiedReponse = items.join('');
              // if (!stringifiedReponse.length) { // precisa criar um teste pra esse path (branch no coverage)
              //   throw new Error(
              //     JSON.stringify({
              //       error: true,
              //       message: 'Received empty response',
              //     })
              //   );
              // }
              resolve(JSON.parse(stringifiedReponse));
            });
        })
        .on('error', reject);
    });
  }

  async makeRequest({ url, method, timeout }) {
    return Promise.race([
      this[method](url),
      this.raceTimeoutDelay(url, timeout),
    ]);
  }
};
