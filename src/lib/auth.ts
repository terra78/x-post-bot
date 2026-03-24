import { createHmac } from "crypto";
import { config } from "../config";

const COOKIE_NAME = "x_post_bot_session";

export const authCookieName = COOKIE_NAME;

const buildToken = (): string => {
  const seed = `${config.adminUsername}:${config.adminPassword}`;
  return createHmac("sha256", config.cookieSecret).update(seed).digest("hex");
};

const expectedToken = buildToken();

export const isValidCredential = (username: string, password: string): boolean => {
  return username === config.adminUsername && password === config.adminPassword;
};

export const issueSessionToken = (): string => expectedToken;

export const isAuthenticated = (cookieValue: string | undefined): boolean => {
  return cookieValue === expectedToken;
};
