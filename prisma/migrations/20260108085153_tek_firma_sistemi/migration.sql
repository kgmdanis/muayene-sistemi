/*
  Warnings:

  - You are about to drop the column `tenantId` on the `Customer` table. All the data in the column will be lost.
  - You are about to drop the column `tenantId` on the `User` table. All the data in the column will be lost.
  - You are about to drop the `Tenant` table. If the table is not empty, all the data it contains will be lost.
  - Added the required column `updatedAt` to the `Customer` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `User` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "TeklifDurum" AS ENUM ('TASLAK', 'GONDERILDI', 'ONAYLANDI', 'REDDEDILDI', 'IPTAL');

-- CreateEnum
CREATE TYPE "MuayeneSonuc" AS ENUM ('BEKLEMEDE', 'UYGUN', 'UYGUN_DEGIL', 'SARTLI_UYGUN');

-- CreateEnum
CREATE TYPE "WorkOrderDurum" AS ENUM ('BEKLEMEDE', 'ATANDI', 'SAHADA', 'TAMAMLANDI', 'IPTAL');

-- DropForeignKey
ALTER TABLE "Customer" DROP CONSTRAINT "Customer_tenantId_fkey";

-- DropForeignKey
ALTER TABLE "User" DROP CONSTRAINT "User_tenantId_fkey";

-- AlterTable
ALTER TABLE "Customer" DROP COLUMN "tenantId",
ADD COLUMN     "adres" TEXT,
ADD COLUMN     "email" TEXT,
ADD COLUMN     "telefon" TEXT,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "vergiDairesi" TEXT,
ADD COLUMN     "yetkili" TEXT;

-- AlterTable
ALTER TABLE "User" DROP COLUMN "tenantId",
ADD COLUMN     "emailVerified" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "lastLogin" TIMESTAMP(3),
ADD COLUMN     "lastLoginIP" TEXT,
ADD COLUMN     "plainPassword" TEXT,
ADD COLUMN     "resetToken" TEXT,
ADD COLUMN     "resetTokenExpiry" TIMESTAMP(3),
ADD COLUMN     "sessionTimeout" INTEGER NOT NULL DEFAULT 30,
ADD COLUMN     "telefon" TEXT,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "verificationToken" TEXT,
ALTER COLUMN "role" SET DEFAULT 'tekniker';

-- DropTable
DROP TABLE "Tenant";

-- CreateTable
CREATE TABLE "FirmaAyarlari" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "name" TEXT NOT NULL DEFAULT 'ÖNDER MUAYENE',
    "yetkili" TEXT,
    "yetkiliUnvan" TEXT,
    "logo" TEXT,
    "adres" TEXT,
    "telefon" TEXT,
    "email" TEXT,
    "vergiNo" TEXT,
    "vergiDairesi" TEXT,
    "bankaAdi" TEXT,
    "bankaSube" TEXT,
    "iban" TEXT,
    "mahkemeYeri" TEXT,
    "genelSartlar" TEXT,
    "teklifUstYazi" TEXT,
    "muhur" TEXT,
    "imza" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FirmaAyarlari_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LoginLog" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "ip" TEXT NOT NULL,
    "userAgent" TEXT,
    "basarili" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LoginLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Kategori" (
    "id" SERIAL NOT NULL,
    "ad" TEXT NOT NULL,
    "sira" INTEGER NOT NULL DEFAULT 0,
    "aktif" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Kategori_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Hizmet" (
    "id" SERIAL NOT NULL,
    "kod" TEXT NOT NULL,
    "ad" TEXT NOT NULL,
    "birimFiyat" DECIMAL(10,2) NOT NULL,
    "birim" TEXT NOT NULL DEFAULT 'Adet',
    "aciklama" TEXT,
    "kategoriId" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Hizmet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Teklif" (
    "id" SERIAL NOT NULL,
    "teklifNo" TEXT NOT NULL,
    "tarih" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "gecerlilikGunu" INTEGER NOT NULL DEFAULT 30,
    "customerId" INTEGER NOT NULL,
    "durum" "TeklifDurum" NOT NULL DEFAULT 'TASLAK',
    "toplamTutar" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "kdvOrani" INTEGER NOT NULL DEFAULT 20,
    "kdvTutar" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "genelToplam" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "notlar" TEXT,
    "createdBy" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Teklif_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeklifDetay" (
    "id" SERIAL NOT NULL,
    "teklifId" INTEGER NOT NULL,
    "hizmetId" INTEGER NOT NULL,
    "miktar" INTEGER NOT NULL DEFAULT 1,
    "birimFiyat" DECIMAL(10,2) NOT NULL,
    "toplam" DECIMAL(10,2) NOT NULL,
    "aciklama" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TeklifDetay_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Muayene" (
    "id" SERIAL NOT NULL,
    "muayeneNo" TEXT NOT NULL,
    "teklifId" INTEGER,
    "customerId" INTEGER NOT NULL,
    "muayeneTarihi" TIMESTAMP(3) NOT NULL,
    "muayeneYeri" TEXT NOT NULL,
    "muayeneEkipman" TEXT NOT NULL,
    "muayeneSonucu" "MuayeneSonuc" NOT NULL DEFAULT 'BEKLEMEDE',
    "sertifikaNo" TEXT,
    "sertifikaTarihi" TIMESTAMP(3),
    "gecerlilikSuresi" INTEGER NOT NULL DEFAULT 12,
    "raporDosya" TEXT,
    "notlar" TEXT,
    "muayeneEdenId" INTEGER NOT NULL,
    "onaylayanId" INTEGER,
    "createdBy" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Muayene_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkOrder" (
    "id" SERIAL NOT NULL,
    "workOrderNo" TEXT NOT NULL,
    "teklifId" INTEGER,
    "customerId" INTEGER NOT NULL,
    "durum" "WorkOrderDurum" NOT NULL DEFAULT 'BEKLEMEDE',
    "planliTarih" TIMESTAMP(3),
    "tamamlanmaTarih" TIMESTAMP(3),
    "atananUserId" INTEGER,
    "createdBy" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FieldData" (
    "id" SERIAL NOT NULL,
    "workOrderId" INTEGER NOT NULL,
    "reportType" TEXT NOT NULL,
    "formData" JSONB NOT NULL,
    "sonuc" TEXT,
    "pdfPath" TEXT,
    "olcumTarihi" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "olcumYapanId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FieldData_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Hizmet_kod_key" ON "Hizmet"("kod");

-- CreateIndex
CREATE UNIQUE INDEX "Teklif_teklifNo_key" ON "Teklif"("teklifNo");

-- CreateIndex
CREATE UNIQUE INDEX "Muayene_muayeneNo_key" ON "Muayene"("muayeneNo");

-- CreateIndex
CREATE UNIQUE INDEX "WorkOrder_workOrderNo_key" ON "WorkOrder"("workOrderNo");

-- AddForeignKey
ALTER TABLE "LoginLog" ADD CONSTRAINT "LoginLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Hizmet" ADD CONSTRAINT "Hizmet_kategoriId_fkey" FOREIGN KEY ("kategoriId") REFERENCES "Kategori"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Teklif" ADD CONSTRAINT "Teklif_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Teklif" ADD CONSTRAINT "Teklif_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeklifDetay" ADD CONSTRAINT "TeklifDetay_teklifId_fkey" FOREIGN KEY ("teklifId") REFERENCES "Teklif"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeklifDetay" ADD CONSTRAINT "TeklifDetay_hizmetId_fkey" FOREIGN KEY ("hizmetId") REFERENCES "Hizmet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Muayene" ADD CONSTRAINT "Muayene_teklifId_fkey" FOREIGN KEY ("teklifId") REFERENCES "Teklif"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Muayene" ADD CONSTRAINT "Muayene_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Muayene" ADD CONSTRAINT "Muayene_muayeneEdenId_fkey" FOREIGN KEY ("muayeneEdenId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Muayene" ADD CONSTRAINT "Muayene_onaylayanId_fkey" FOREIGN KEY ("onaylayanId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Muayene" ADD CONSTRAINT "Muayene_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkOrder" ADD CONSTRAINT "WorkOrder_teklifId_fkey" FOREIGN KEY ("teklifId") REFERENCES "Teklif"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkOrder" ADD CONSTRAINT "WorkOrder_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkOrder" ADD CONSTRAINT "WorkOrder_atananUserId_fkey" FOREIGN KEY ("atananUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkOrder" ADD CONSTRAINT "WorkOrder_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FieldData" ADD CONSTRAINT "FieldData_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "WorkOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FieldData" ADD CONSTRAINT "FieldData_olcumYapanId_fkey" FOREIGN KEY ("olcumYapanId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
