/**
 * A plain zip writer: files are stored as they are (PNG and GIF are already compressed, so
 * deflating them again gains nothing), with CRC-32s, UTF-8 names and a central directory.
 */

const CRC = (() => {
	const t = new Uint32Array(256)
	for (let n = 0; n < 256; n++) {
		let c = n
		for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
		t[n] = c >>> 0
	}
	return t
})()

export function crc32(data: Uint8Array): number {
	let c = 0xffffffff
	for (let i = 0; i < data.length; i++)
		c = CRC[(c ^ data[i]!) & 0xff]! ^ (c >>> 8)
	return (c ^ 0xffffffff) >>> 0
}

function utf8(s: string): Uint8Array {
	const out: number[] = []
	for (const ch of s) {
		let c = ch.codePointAt(0)!
		if (c < 0x80) out.push(c)
		else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63))
		else if (c < 0x10000)
			out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63))
		else {
			out.push(
				0xf0 | (c >> 18),
				0x80 | ((c >> 12) & 63),
				0x80 | ((c >> 6) & 63),
				0x80 | (c & 63),
			)
		}
	}
	return Uint8Array.from(out)
}

export function zip(files: { name: string; data: Uint8Array }[]): Uint8Array {
	const entries = files.map(f => ({
		...f,
		n: utf8(f.name),
		crc: crc32(f.data),
	}))
	let size = 22
	for (const e of entries)
		size += 30 + e.n.length + e.data.length + 46 + e.n.length
	const out = new Uint8Array(size)
	const v = new DataView(out.buffer)
	let p = 0
	const offsets: number[] = []
	// 1980-01-01, the earliest date a zip can hold.
	const DATE = (0 << 9) | (1 << 5) | 1
	for (const e of entries) {
		offsets.push(p)
		v.setUint32(p, 0x04034b50, true)
		v.setUint16(p + 4, 20, true)
		v.setUint16(p + 6, 0x0800, true) // names are UTF-8
		v.setUint16(p + 8, 0, true) // stored
		v.setUint16(p + 10, 0, true)
		v.setUint16(p + 12, DATE, true)
		v.setUint32(p + 14, e.crc, true)
		v.setUint32(p + 18, e.data.length, true)
		v.setUint32(p + 22, e.data.length, true)
		v.setUint16(p + 26, e.n.length, true)
		v.setUint16(p + 28, 0, true)
		out.set(e.n, p + 30)
		out.set(e.data, p + 30 + e.n.length)
		p += 30 + e.n.length + e.data.length
	}
	const dir = p
	entries.forEach((e, i) => {
		v.setUint32(p, 0x02014b50, true)
		v.setUint16(p + 4, 20, true)
		v.setUint16(p + 6, 20, true)
		v.setUint16(p + 8, 0x0800, true)
		v.setUint16(p + 10, 0, true)
		v.setUint16(p + 12, 0, true)
		v.setUint16(p + 14, DATE, true)
		v.setUint32(p + 16, e.crc, true)
		v.setUint32(p + 20, e.data.length, true)
		v.setUint32(p + 24, e.data.length, true)
		v.setUint16(p + 28, e.n.length, true)
		v.setUint16(p + 30, 0, true)
		v.setUint16(p + 32, 0, true)
		v.setUint16(p + 34, 0, true)
		v.setUint16(p + 36, 0, true)
		v.setUint32(p + 38, 0, true)
		v.setUint32(p + 42, offsets[i]!, true)
		out.set(e.n, p + 46)
		p += 46 + e.n.length
	})
	v.setUint32(p, 0x06054b50, true)
	v.setUint16(p + 8, entries.length, true)
	v.setUint16(p + 10, entries.length, true)
	v.setUint32(p + 12, p - dir, true)
	v.setUint32(p + 16, dir, true)
	return out
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

export function base64(data: Uint8Array): string {
	const parts: string[] = []
	let chunk = ''
	let i = 0
	for (; i + 2 < data.length; i += 3) {
		const n = (data[i]! << 16) | (data[i + 1]! << 8) | data[i + 2]!
		chunk +=
			B64[n >> 18]! + B64[(n >> 12) & 63]! + B64[(n >> 6) & 63]! + B64[n & 63]!
		if (chunk.length >= 65536) {
			parts.push(chunk)
			chunk = ''
		}
	}
	const rest = data.length - i
	if (rest === 1) {
		const n = data[i]! << 16
		chunk += `${B64[n >> 18]}${B64[(n >> 12) & 63]}==`
	} else if (rest === 2) {
		const n = (data[i]! << 16) | (data[i + 1]! << 8)
		chunk += `${B64[n >> 18]}${B64[(n >> 12) & 63]}${B64[(n >> 6) & 63]}=`
	}
	parts.push(chunk)
	return parts.join('')
}
