import { Controller, Get, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { join } from 'path';
import { existsSync } from 'fs';

@Controller()
export class ViewController {
  private readonly clientDir = join(process.cwd(), 'dist/client');

  @Get('*')
  serve(@Req() req: Request, @Res() res: Response) {
    if (req.path.startsWith('/api')) {
      res.status(404).json({ error: 'Not found' });
      return;
    }

    const filePath = join(this.clientDir, req.path);
    if (req.path !== '/' && existsSync(filePath)) {
      res.sendFile(filePath);
    } else {
      res.sendFile(join(this.clientDir, 'index.html'));
    }
  }
}
