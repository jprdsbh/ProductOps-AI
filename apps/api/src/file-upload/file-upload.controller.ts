import {
  Controller, Post, UseGuards, UseInterceptors, UploadedFile, BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { v4 as uuid } from 'uuid';
import * as path from 'path';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

const uploadsDir = path.resolve(__dirname, '../../../uploads');

@Controller('uploads')
export class FileUploadController {
  @UseGuards(JwtAuthGuard)
  @Post('image')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: uploadsDir,
        filename: (_req, _file, cb) => cb(null, `${uuid().replace(/-/g, '')}.png`),
      }),
      limits: { fileSize: 10 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        if (!file.mimetype.startsWith('image/')) {
          return cb(new BadRequestException('Only image files are allowed'), false);
        }
        cb(null, true);
      },
    }),
  )
  upload(@UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('No file uploaded');
    const baseUrl = process.env.API_URL ?? 'http://localhost:3002';
    return { imageUrl: `${baseUrl}/uploads/${file.filename}` };
  }
}
