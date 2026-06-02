"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const bcrypt = require("bcrypt");
const prisma = new client_1.PrismaClient();
async function main() {
    const email = process.env.ADMIN_EMAIL ?? 'admin@tpay.com.br';
    const password = process.env.ADMIN_PASSWORD ?? 'admin123';
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
        console.log(`Admin user already exists: ${email}`);
        return;
    }
    const hashed = await bcrypt.hash(password, 10);
    await prisma.user.create({ data: { email, password: hashed, name: 'Admin' } });
    console.log(`Admin user created: ${email}`);
}
main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
//# sourceMappingURL=seed.js.map