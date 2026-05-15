import dotenv from 'dotenv';
dotenv.config();

console.log("Service Key:", process.env.SUPABASE_SERVICE_ROLE_KEY ? "EXISTS" : "MISSING");
console.log("Anon Key:", process.env.SUPABASE_ANON_KEY ? "EXISTS" : "MISSING");
console.log("Database URL:", process.env.DATABASE_URL ? "EXISTS" : "MISSING");
