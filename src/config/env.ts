const getEnv = (key: string, defaultValue?: string): string => {
  const value = process.env[key] || defaultValue;

  if (value === undefined) {
    throw Error(`Missing String environment variable for ${key}`);
  }
  return value;
};

export const PORT = getEnv("PORT", "8080");
export const OVERSHOOT_API_KEY = getEnv("OVERSHOOT_API_KEY");
export const DATABASE_URL = getEnv("DATABASE_URL");