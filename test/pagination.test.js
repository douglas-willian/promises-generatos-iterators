const assert = require('assert');
const { createSandbox } = require('sinon');
const Pagination = require('../src/pagination');
const Request = require('../src/request');

describe('#Pagination tests', () => {
  const timeout = 15;
  let sandbox;

  before(() => {
    sandbox = createSandbox();
  });

  afterEach(() => sandbox.restore());

  describe('#Pagination', () => {
    it('should have default options on Pagination instance', () => {
      const pagination = new Pagination();
      const expectedProperties = {
        maxRetries: 4,
        retryTimeout: 1000,
        maxRequestTimeout: 1000,
        threshold: 200,
      };

      assert.ok(pagination.request instanceof Request);
      Reflect.deleteProperty(pagination, 'request');

      const getEntries = (item) => Object.entries(item);
      assert.deepStrictEqual(
        getEntries(pagination),
        getEntries(expectedProperties)
      );
    });

    it('should set default options on Pagination instance', () => {
      const params = {
        maxRetries: 2,
        retryTimeout: 100,
        maxRequestTimeout: 10,
        threshold: 10,
      };

      const pagination = new Pagination(params);
      const expectedProperties = {
        request: {},
        ...params,
      };

      assert.ok(pagination.request instanceof Request);
      assert.deepStrictEqual(
        JSON.stringify(pagination),
        JSON.stringify(expectedProperties)
      );
    });

    it('#sleep should be a Promise object and not return values', async () => {
      const clock = sandbox.useFakeTimers();
      const time = 1;
      const pendingPromise = Pagination.sleep(time);
      clock.tick(time);

      assert.ok(pendingPromise instanceof Promise);
      const result = await pendingPromise;
      assert.ok(result === undefined);
    });

    describe('#handleRequest', () => {
      it('should retry a request twice before an exception and validate request params and flow', async () => {
        const expectedCallCount = 2;
        const expectedTimeout = 10;

        const pagination = new Pagination();
        pagination.maxRetries = expectedCallCount;
        pagination.retryTimeout = expectedTimeout;
        pagination.maxRequestTimeout = expectedTimeout;

        const error = new Error('timeout');

        sandbox.spy(pagination, pagination.handleRequest.name);
        sandbox.stub(Pagination, Pagination.sleep.name).resolves();

        sandbox
          .stub(pagination.request, pagination.request.makeRequest.name)
          .rejects(error);

        const dataRequest = {
          url: 'https://google.com',
          page: 0,
        };

        await assert.rejects(pagination.handleRequest(dataRequest), error);
        assert.deepStrictEqual(
          pagination.handleRequest.callCount,
          expectedCallCount
        );

        const lastCall = 1; // Esse bloco vai verificar o primeiro argumento na ultima vez que a função foi chamada, e comparar com o que a gente espera
        const firstCallArg = pagination.handleRequest.getCall(lastCall)
          .firstArg;
        const firstCallRetries = firstCallArg.retries;
        assert.deepStrictEqual(firstCallRetries, expectedCallCount);

        const expectedArgs = {
          url: `${dataRequest.url}?tid=${dataRequest.page}`,
          method: 'get',
          timeout: expectedTimeout,
        };

        const firstCallArgs = pagination.request.makeRequest.getCall(0).args;
        assert.deepStrictEqual(firstCallArgs, [expectedArgs]);

        assert.ok(Pagination.sleep.calledWithExactly(expectedTimeout));
      });

      it('should return data from request when succeeded', async () => {
        const data = { result: 'ok' };
        const pagination = new Pagination();
        sandbox
          .stub(pagination.request, pagination.request.makeRequest.name)
          .resolves(data);

        const result = await pagination.handleRequest({
          url: 'https://google.com',
          page: 1,
        });
        assert.deepStrictEqual(result, data);
      });
    });

    describe('#getPaginated', () => {
      const responseMock = [
        {
          tid: 8683924,
          date: 1613610672,
          type: 'sell',
          price: 288000,
          amount: 0.06,
        },
        {
          tid: 8683925,
          date: 1613210672,
          type: 'buy',
          price: 240000,
          amount: 0.00092788,
        },
      ];

      it('should update request id on each request', async () => {
        const pagination = new Pagination();
        sandbox.stub(Pagination, Pagination.sleep.name).resolves();

        sandbox
          .stub(pagination, pagination.handleRequest.name)
          .onCall(0)
          .resolves([responseMock[0]])
          .onCall(1)
          .resolves([responseMock[1]])
          .onCall(2)
          .resolves([]);

        sandbox.spy(pagination, pagination.getPaginated.name);
        const data = {
          url: 'google.com',
          page: 1,
        };
        const secondCallExpectation = {
          ...data,
          page: responseMock[0].tid,
        };
        const thirdCallExpectation = {
          ...secondCallExpectation,
          page: responseMock[1].tid,
        };

        /* 
          para chamar uma funcao que é um generator
          Array.from(pagination.getPaginated()) -> dessa forma ele nao espera os dados sob demanda!
          ele vai guardar tudo em memoria e só depois jogar no array

          Poderia fazer:
            const r = pagination.getPaginated()
            r.next() -> { done: true | false, value: {} }

          Mas a melhor forma é usar o for await of
        */

        const gen = pagination.getPaginated(data);
        for await (const result of gen) {
          // com for await ele ja resolve a promise, assim ja vc ja recebe o value direto e nao precisa usar o .next()
        }

        const getFirstArgFromCall = (value) =>
          pagination.handleRequest.getCall(value).firstArg;
        assert.deepStrictEqual(getFirstArgFromCall(0), data);
        assert.deepStrictEqual(getFirstArgFromCall(1), secondCallExpectation);
        assert.deepStrictEqual(getFirstArgFromCall(2), thirdCallExpectation);
      });

      it('should stop requesting when request returns an empty array', async () => {
        const expectedThreshold = 20;
        const pagination = new Pagination();
        pagination.threshold = expectedThreshold;

        sandbox.stub(Pagination, Pagination.sleep.name).resolves();

        sandbox
          .stub(pagination, pagination.handleRequest.name)
          .onCall(0)
          .resolves([responseMock[0]])
          .onCall(1)
          .resolves([]);

        sandbox.spy(pagination, pagination.getPaginated.name);
        const data = {
          url: 'google.com',
          page: 1,
        };

        const iterator = await pagination.getPaginated(data);
        const [firstResult, secondResult] = await Promise.all([
          iterator.next(),
          iterator.next(),
        ]);

        const expectedFirstCall = { done: false, value: [responseMock[0]] };
        assert.deepStrictEqual(firstResult, expectedFirstCall);

        const expectedSecondCall = { done: true, value: undefined };
        assert.deepStrictEqual(secondResult, expectedSecondCall);

        assert.deepStrictEqual(Pagination.sleep.callCount, 1);
        assert.ok(Pagination.sleep.calledWithExactly(expectedThreshold));
      });
    });
  });
});
