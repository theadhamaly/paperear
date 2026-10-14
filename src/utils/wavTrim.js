const HEADER_BYTES = 44
const FLOOR = 0.012

export function audibleSeconds(buffer) {
    if (!buffer || buffer.byteLength <= HEADER_BYTES) return 0
    const view = new DataView(buffer)
    const sampleRate = view.getUint32(24, true)
    if (!sampleRate || view.getUint16(34, true) !== 16) return 0
    const count = Math.floor((buffer.byteLength - HEADER_BYTES) / 2)
    const limit = FLOOR * 32768
    let first = -1
    let last = -1
    for (let i = 0; i < count; i++) {
        if (Math.abs(view.getInt16(HEADER_BYTES + i * 2, true)) > limit) {
            if (first < 0) first = i
            last = i
        }
    }
    return first < 0 ? 0 : (last - first + 1) / sampleRate
}
