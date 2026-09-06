import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import os from 'os';

const execAsync = promisify(exec);

export class LibreOfficeNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LibreOfficeNotFoundError';
  }
}

/**
 * Converts a DOCX buffer to a PDF buffer using LibreOffice in headless mode.
 * Runs inside the Cloud Run Docker container or on systems with LibreOffice installed.
 */
export async function convertDocxToPdf(docxBuffer: Buffer): Promise<Buffer> {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'report-convert-'));
  const inputDocxPath = path.join(tempDir, 'input.docx');
  const expectedPdfPath = path.join(tempDir, 'input.pdf');

  try {
    fs.writeFileSync(inputDocxPath, docxBuffer);

    // Command to execute
    // Cloud Run Linux container has `soffice` or `libreoffice`
    const cmd = `soffice --headless --convert-to pdf --outdir "${tempDir}" "${inputDocxPath}"`;

    try {
      await execAsync(cmd, { timeout: 30000 });
    } catch (cmdError: any) {
      // Try with 'libreoffice' command alias as fallback
      try {
        const fallbackCmd = `libreoffice --headless --convert-to pdf --outdir "${tempDir}" "${inputDocxPath}"`;
        await execAsync(fallbackCmd, { timeout: 30000 });
      } catch (fallbackError: any) {
        throw new LibreOfficeNotFoundError(
          `LibreOffice is not installed or not in PATH: ${cmdError.message || fallbackError.message}`
        );
      }
    }

    if (!fs.existsSync(expectedPdfPath)) {
      throw new Error('PDF conversion finished but output file was not found');
    }

    const pdfBuffer = fs.readFileSync(expectedPdfPath);
    return pdfBuffer;
  } finally {
    // Cleanup temporary files
    try {
      if (fs.existsSync(inputDocxPath)) fs.unlinkSync(inputDocxPath);
      if (fs.existsSync(expectedPdfPath)) fs.unlinkSync(expectedPdfPath);
      if (fs.existsSync(tempDir)) fs.rmdirSync(tempDir);
    } catch (cleanupErr) {
      console.warn('Temporary file cleanup failed:', cleanupErr);
    }
  }
}
