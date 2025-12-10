import { Sequelize } from "sequelize-typescript";
import dotenv from "dotenv";
import path from "path";

dotenv.config();

// Debug logs
console.log("NODE_ENV:", process.env.NODE_ENV);
console.log("DATABASE_URL:", process.env.DATABASE_URL);

if (!process.env.DATABASE_URL) {
  console.error("❌ DATABASE_URL is missing in your .env");
  process.exit(1);
}

// ✅ Final working Sequelize config for Supabase
const sequelize = new Sequelize(process.env.DATABASE_URL, {
  dialect: "postgres",
  models: [path.join(__dirname, "../models")],
  logging: process.env.NODE_ENV === "development" ? console.log : false,

  dialectOptions: {
    ssl: {
      require: true,
      rejectUnauthorized: false,
    },
  },

  pool: {
    max: 10,
    min: 0,
    acquire: 30000,
    idle: 10000,
  },
});

// ---- CONNECTION TEST ----
export const testConnection = async () => {
  try {
    console.log("🔄 Connecting to database...");
    await sequelize.authenticate();
    console.log("✅ Database connection successful");
    return true;
  } catch (error: any) {
    console.error("❌ Database connection failed:", error.message);
    console.log("🔧 Fix:");
    console.log("1. Ensure DATABASE_URL is correct");
    console.log("2. Supabase requires SSL = require|prefer");
    console.log("3. Make sure your password has NO special characters unescaped");
    return false;
  }
};

export default sequelize;
