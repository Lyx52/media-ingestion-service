import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Observable } from 'rxjs';
import { Request } from 'express';
import * as CryptoJS from 'crypto-js';
import { Reflector } from '@nestjs/core';
@Injectable()
export class HmacAuthGuard implements CanActivate {
  public constructor(
    private readonly secret: string,
    private readonly key: string,
    private readonly reflector: Reflector,
  ) {}
  canActivate(
    context: ExecutionContext,
  ): boolean | Promise<boolean> | Observable<boolean> {
    // Handle public routes
    const isPublic = this.reflector.get<boolean>(
      'isPublic',
      context.getHandler(),
    );
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest();
    return this.authenticate(request);
  }
  authenticate(req: Request): boolean {
    const providedSignature = req.headers['x-signature'];
    const providedApiKey = req.headers['api-key'];
    const computedSignature = this.computeSignature(req);
    return (
      providedSignature === computedSignature && providedApiKey === this.key
    );
  }

  private computeSignature(req: Request): string {
    const data = req.method + req.path + JSON.stringify(req.body);
    return CryptoJS.HmacSHA256(data.toLowerCase(), this.secret).toString(
      CryptoJS.enc.Hex,
    );
  }
}
