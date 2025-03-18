const { fetchData, insertData } = require('../scripts/fetch-and-insert-data');
const { MongoClient } = require('mongodb');

describe('Data Fetching and Insertion', () => {
    let client;
    let db;

    beforeAll(async () => {
        client = new MongoClient(MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true });
        await client.connect();
        db = client.db(DB_NAME);
    });

    afterAll(async () => {
        await client.close();
    });

    test('fetchData should return data from API', async () => {
        const data = await fetchData('nfl/player-stats');
        expect(data).toBeInstanceOf(Array);
    });

    test('insertData should insert data into MongoDB', async () => {
        const data = [{ playerId: 'test', stats: {} }];
        await insertData('test_collection', data);
        const insertedData = await db.collection('test_collection').find().toArray();
        expect(insertedData).toHaveLength(1);
    });
});
