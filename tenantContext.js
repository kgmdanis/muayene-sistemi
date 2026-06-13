// İstek başına tenant bağlamı (AsyncLocalStorage).
// Global /api middleware her istekte run() ile { tenantId, role } set eder;
// Prisma extension getTenantId() ile okuyup sorguları otomatik filtreler.
const { AsyncLocalStorage } = require('async_hooks');

const als = new AsyncLocalStorage();

module.exports = {
    run(ctx, fn) {
        return als.run(ctx, fn);
    },
    get() {
        return als.getStore() || {};
    },
    // tenantId yoksa undefined döner (superadmin / sistem / pre-auth → filtreleme yapılmaz)
    getTenantId() {
        const s = als.getStore();
        return s ? s.tenantId : undefined;
    }
};
