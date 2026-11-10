import { describe, it, expect } from 'vitest';
import { detectResumeType, resumePathOf } from './resumeStorage';

describe('resumeStorage', () => {
  it('reconoce PDF, DOCX y DOC por sus primeros bytes, no por la extensión', () => {
    expect(detectResumeType(new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]))?.ext).toBe('pdf');
    expect(detectResumeType(new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x14]))?.ext).toBe('docx');
    expect(detectResumeType(new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1]))?.ext).toBe('doc');
    // Un ejecutable renombrado a .pdf no pasa
    expect(detectResumeType(new Uint8Array([0x4d, 0x5a, 0x90, 0x00]))).toBeNull();
  });

  it('ruta en el bucket: formato nuevo y URL pública antigua; los enlaces externos no son del bucket', () => {
    expect(resumePathOf('storage:resumes/u1/cv-1.pdf')).toBe('u1/cv-1.pdf');
    expect(resumePathOf('https://x.supabase.co/storage/v1/object/public/resumes/u1/cv%201.pdf?t=1')).toBe('u1/cv 1.pdf');
    expect(resumePathOf('https://drive.google.com/resumes/u1/cv.pdf')).toBeNull();
    expect(resumePathOf(null)).toBeNull();
  });
});
