import database from 'mongoose';

database.set('strictQuery', true);

/**
 * 連接至 MongoDB 資料庫
 * @param uri MongoDB 連線字串 (選填)
 * @returns Mongoose 連線實例 Promise
 */
export const prepare = (uri?: string) =>
  database.connect(
      uri || process.env.MONGODB_URI || 'mongodb://localhost:27017/archiver',
      {
        serverSelectionTimeoutMS: 2000,
      },
  );

/**
 * 取得 Mongoose 實例
 * @returns Mongoose 實例
 */
export const useDatabase = () => database;

export default database;
