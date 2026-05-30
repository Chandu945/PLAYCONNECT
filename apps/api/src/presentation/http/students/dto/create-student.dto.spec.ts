import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { CreateStudentDto } from './create-student.dto';
import { UpdateStudentDto } from './update-student.dto';

describe('student DTO whatsappNumber — aligned to E.164 (matches the domain validator)', () => {
  async function whatsappError(dto: object) {
    const errors = await validate(dto);
    return errors.find((e) => e.property === 'whatsappNumber');
  }

  it('CreateStudentDto accepts an E.164 whatsappNumber', async () => {
    const dto = plainToInstance(CreateStudentDto, { whatsappNumber: '+919491823468' });
    expect(await whatsappError(dto)).toBeUndefined();
  });

  it('CreateStudentDto rejects a digits-only whatsappNumber (the old format the domain rejected)', async () => {
    const dto = plainToInstance(CreateStudentDto, { whatsappNumber: '9876543210' });
    expect(await whatsappError(dto)).toBeDefined();
  });

  it('UpdateStudentDto accepts an E.164 whatsappNumber', async () => {
    const dto = plainToInstance(UpdateStudentDto, { whatsappNumber: '+919491823468' });
    expect(await whatsappError(dto)).toBeUndefined();
  });

  it('UpdateStudentDto rejects a digits-only whatsappNumber', async () => {
    const dto = plainToInstance(UpdateStudentDto, { whatsappNumber: '9876543210' });
    expect(await whatsappError(dto)).toBeDefined();
  });
});
