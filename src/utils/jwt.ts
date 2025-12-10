import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';

dotenv.config();

interface JwtPayload {
  userId: string;
  email: string;
}

class JwtService {
  private readonly secret: string;
  private readonly expiresIn: string;
  private readonly refreshExpiresIn: string;

  constructor() {
    this.secret = process.env.JWT_SECRET || 'default_secret_change_in_production';
    this.expiresIn = process.env.JWT_EXPIRY || '24h';
    this.refreshExpiresIn = process.env.JWT_REFRESH_EXPIRY || '7d';
  }

  generateToken(payload: JwtPayload): string {
    return jwt.sign(payload, this.secret, { expiresIn: this.expiresIn } as jwt.SignOptions);
  }
  generateRefreshToken(payload: JwtPayload): string {
    return jwt.sign(payload, this.secret, { expiresIn: this.refreshExpiresIn } as jwt.SignOptions);
  }

  verifyToken(token: string): JwtPayload {
    try {
      return jwt.verify(token, this.secret) as JwtPayload;
    } catch (error) {
      throw new Error('Invalid or expired token');
    }
  }

  decodeToken(token: string): JwtPayload | null {
    try {
      return jwt.decode(token) as JwtPayload;
    } catch (error) {
      return null;
    }
  }

  isTokenExpired(token: string): boolean {
    try {
      const decoded = jwt.decode(token) as any;
      if (!decoded || !decoded.exp) return true;
      
      const currentTime = Math.floor(Date.now() / 1000);
      return decoded.exp < currentTime;
    } catch (error) {
      return true;
    }
  }

  refreshToken(oldToken: string): string | null {
    try {
      const payload = this.verifyToken(oldToken);
      return this.generateToken(payload);
    } catch (error) {
      return null;
    }
  }
}

export default new JwtService();