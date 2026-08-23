/**
 * Volcado logico de la base de produccion a ficheros JSON en disco.
 *
 * Existe porque el 2026-08-23 se perdio la base entera —13 tablas, 2053 picks,
 * 7 usuarios— al pasarle el DATABASE_URL de produccion a un comando de Prisma
 * como shadow database. Se recupero por el point-in-time restore de Neon, que
 * entonces tenia una ventana de 6 horas. La recuperacion no dependio de tener
 * un backup: dependio de que el borrado se detectase dentro de esa ventana.
 *
 * Esto es la red por debajo: un volcado que no caduca. Lanzalo ANTES de
 * cualquier operacion de esquema.
 *
 *   npm run backup
 *
 * Escribe en ~/20bids-backups/dump-<timestamp>/, deliberadamente FUERA del
 * repositorio: contiene los emails y los hashes de contrasena de los usuarios
 * y no debe poder llegar a git por accidente.
 *
 * Volcado logico, no fisico: sirve para reconstruir e inspeccionar, no para un
 * restore transaccional. Para eso esta el historial de Neon.
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';
import os from 'os';

const prisma = new PrismaClient();

/** JSON.stringify no sabe serializar BigInt y revienta con un TypeError. */
function replacer(_key: string, value: unknown) {
    return typeof value === 'bigint' ? value.toString() : value;
}

async function main() {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const outDir = path.join(os.homedir(), '20bids-backups', `dump-${stamp}`);
    fs.mkdirSync(outDir, { recursive: true });

    // Se enumeran desde el catalogo, no desde una lista escrita a mano: una
    // tabla nueva entra en el backup sola. Una lista a mano habria dejado
    // fuera cada tabla anadida despues de escribir este fichero.
    const tables = await prisma.$queryRawUnsafe<{ table_name: string }[]>(
        `SELECT table_name FROM information_schema.tables
         WHERE table_schema = 'public' ORDER BY table_name`
    );

    let total = 0;
    for (const { table_name } of tables) {
        const rows = await prisma.$queryRawUnsafe<unknown[]>(`SELECT * FROM "${table_name}"`);
        fs.writeFileSync(
            path.join(outDir, `${table_name}.json`),
            JSON.stringify(rows, replacer, 1)
        );
        console.log(`  ${table_name.padEnd(22)} ${rows.length}`);
        total += rows.length;
    }

    fs.writeFileSync(
        path.join(outDir, 'MANIFEST.json'),
        JSON.stringify({
            takenAt: new Date().toISOString(),
            host: (process.env.DATABASE_URL || '').replace(/:\/\/[^@]+@/, '://***@'),
            tables: tables.map(t => t.table_name),
            totalRows: total,
        }, null, 2)
    );

    console.log(`\n${total} filas en ${tables.length} tablas → ${outDir}`);
    console.log('Recuerda: contiene datos personales. No lo metas en git.');
}

main()
    .catch(e => { console.error('Backup FALLIDO:', e); process.exit(1); })
    .finally(() => prisma.$disconnect());
