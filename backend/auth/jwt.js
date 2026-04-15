import jwt from "jsonwebtoken";
import { randomUUID } from "node:crypto";

const getSecret = () => {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET is required");
  return secret;
};

export const createToken = (address, verified = true) => {
  return jwt.sign(
    {
      sub: address.toLowerCase(),
      verified,
      jti: randomUUID(),
    },
    getSecret(),
    { expiresIn: "7d" }
  );
};

export const validateToken = (token) => {
  return jwt.verify(token, getSecret());
};
