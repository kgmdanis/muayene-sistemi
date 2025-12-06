const { PrismaClient } = require('@prisma/client');
const crypto = require('crypto');

const prisma = new PrismaClient();

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
  return salt + ':' + hash;
}

async function main() {
  const kgm = await prisma.tenant.create({
    data: {
      name: 'KGM Dijital',
      logo: '/uploads/kgm-logo.png',
    }
  });

  await prisma.user.create({
    data: {
      email: 'kgmdanismanlik@gmail.com',
      password: hashPassword('Degistir123!'),
      name: 'Abdulkadir',
      role: 'superadmin',
      tenantId: kgm.id,
    }
  });

  console.log('Seed tamamlandi!');
  console.log('Email: kgmdanismanlik@gmail.com');
  console.log('Sifre: Degistir123!');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
