import bcrypt from "bcrypt";
import { PrismaClient } from "../generated/prisma/client";

const prisma = new PrismaClient();

async function main() {
  const passwordHash = await bcrypt.hash("password123", 10);

  const approver = await prisma.user.upsert({
    where: { email: "approver@example.com" },
    update: { firstName: "Ava", lastName: "Approver" },
    create: {
      firstName: "Ava",
      lastName: "Approver",
      email: "approver@example.com",
      passwordHash,
      role: "APPROVER",
    },
  });

  await prisma.user.upsert({
    where: { email: "claimant@example.com" },
    update: { firstName: "Cody", lastName: "Claimant" },
    create: {
      firstName: "Cody",
      lastName: "Claimant",
      email: "claimant@example.com",
      passwordHash,
      role: "CLAIMANT",
      managerId: approver.id,
    },
  });

  await prisma.user.upsert({
    where: { email: "finance@example.com" },
    update: { firstName: "Fin", lastName: "Finance" },
    create: {
      firstName: "Fin",
      lastName: "Finance",
      email: "finance@example.com",
      passwordHash,
      role: "FINANCE",
    },
  });
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
