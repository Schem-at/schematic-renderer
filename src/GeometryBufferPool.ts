export class GeometryBufferPool {
    private static positionPools: Map<number, Float32Array[]> = new Map();
    private static indexPools: Map<number, Uint32Array[]> = new Map();

    static getPositionBuffer(size: number): Float32Array {
        let pool = this.positionPools.get(size);
        if (!pool) {
            pool = [];
            this.positionPools.set(size, pool);
        }
        return pool.pop() || new Float32Array(size);
    }

    static returnPositionBuffer(buffer: Float32Array): void {
        const size = buffer.length;
        let pool = this.positionPools.get(size);
        if (!pool) {
            pool = [];
            this.positionPools.set(size, pool);
        }
        if (pool.length < 10) { // Limit pool size
            pool.push(buffer);
        }
    }

    static getIndexBuffer(size: number): Uint32Array {
        let pool = this.indexPools.get(size);
        if (!pool) {
            pool = [];
            this.indexPools.set(size, pool);
        }
        return pool.pop() || new Uint32Array(size);
    }

    static returnIndexBuffer(buffer: Uint32Array): void {
        const size = buffer.length;
        let pool = this.indexPools.get(size);
        if (!pool) {
            pool = [];
            this.indexPools.set(size, pool);
        }
        if (pool.length < 10) {
            pool.push(buffer);
        }
    }
}
