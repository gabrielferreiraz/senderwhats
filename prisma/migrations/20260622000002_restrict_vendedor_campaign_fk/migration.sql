-- Torna vendedorId opcional e muda FK para SET NULL.
-- Assim excluir uma instância não apaga as campanhas — apenas desvincula.
ALTER TABLE "Campaign" ALTER COLUMN "vendedorId" DROP NOT NULL;

ALTER TABLE "Campaign" DROP CONSTRAINT "Campaign_vendedorId_fkey";
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_vendedorId_fkey"
  FOREIGN KEY ("vendedorId") REFERENCES "Vendedor"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
