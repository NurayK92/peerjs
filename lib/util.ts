import * as BinaryPack from "peerjs-js-binarypack";
import { Supports } from "./supports";

export interface UtilSupportsObj {
	/**
	 * The current browser.
	 * This property can be useful in determining whether two peers can connect.
	 *
	 * ```ts
	 * if (util.browser === 'firefox') {
	 *  // OK to peer with Firefox peers.
	 * }
	 * ```
	 *
	 * `util.browser` can currently have the values
	 * `'firefox', 'chrome', 'safari', 'edge', 'Not a supported browser.', 'Not a browser.' (unknown WebRTC-compatible agent).
	 */
	browser: boolean;
	webRTC: boolean;
	/**
	 * True if the current browser supports media streams and PeerConnection.
	 */
	audioVideo: boolean;
	/**
	 * True if the current browser supports DataChannel and PeerConnection.
	 */
	data: boolean;
	binaryBlob: boolean;
	/**
	 * True if the current browser supports reliable DataChannels.
	 */
	reliable: boolean;
}

const DEFAULT_CONFIG = {
	iceServers: [
		{ urls: "stun:stun.l.google.com:19302" },
		{
			urls: [
				"turn:eu-0.turn.peerjs.com:3478",
				"turn:us-0.turn.peerjs.com:3478",
			],
			username: "peerjs",
			credential: "peerjsp",
		},
	],
	sdpSemantics: "unified-plan",
};

export class Util {
	noop(): void {}

	readonly CLOUD_HOST = "0.peerjs.com";
	readonly CLOUD_PORT = 443;

	// Browsers that need chunking:
	readonly chunkedBrowsers = { Chrome: 1, chrome: 1 };
	readonly chunkedMTU = 16300; // The original 60000 bytes setting does not work when sending data from Firefox to Chrome, which is "cut off" after 16384 bytes and delivered individually.

	// Returns browser-agnostic default config
	readonly defaultConfig = DEFAULT_CONFIG;

	readonly browser = Supports.getBrowser();
	readonly browserVersion = Supports.getVersion();

	/**
	 * A hash of WebRTC features mapped to booleans that correspond to whether the feature is supported by the current browser.
	 *
	 * :::caution
	 * Only the properties documented here are guaranteed to be present on `util.supports`
	 * :::
	 */
	readonly supports = (function () {
		const supported: UtilSupportsObj = {
			browser: Supports.isBrowserSupported(),
			webRTC: Supports.isWebRTCSupported(),
			audioVideo: false,
			data: false,
			binaryBlob: false,
			reliable: false,
		};

		if (!supported.webRTC) return supported;

		let pc: RTCPeerConnection;

		try {
			pc = new RTCPeerConnection(DEFAULT_CONFIG);

			supported.audioVideo = true;

			let dc: RTCDataChannel;

			try {
				dc = pc.createDataChannel("_PEERJSTEST", { ordered: true });
				supported.data = true;
				supported.reliable = !!dc.ordered;

				// Binary test
				try {
					dc.binaryType = "blob";
					supported.binaryBlob = !Supports.isIOS;
				} catch (e) {}
			} catch (e) {
			} finally {
				if (dc) {
					dc.close();
				}
			}
		} catch (e) {
		} finally {
			if (pc) {
				pc.close();
			}
		}

		return supported;
	})();

	// Ensure alphanumeric ids
	validateId(id: string): boolean {
		// Allow empty ids
		return !id || /^[A-Za-z0-9]+(?:[ _-][A-Za-z0-9]+)*$/.test(id);
	}

	pack = BinaryPack.pack;
	unpack = BinaryPack.unpack;

	// Binary stuff

	private _dataCount: number = 1;

	chunk(
		blob: ArrayBuffer,
	): { __peerData: number; n: number; total: number; data: ArrayBuffer }[] {
		const chunks = [];
		const size = blob.byteLength;
		const total = Math.ceil(size / util.chunkedMTU);

		let index = 0;
		let start = 0;

		while (start < size) {
			const end = Math.min(size, start + util.chunkedMTU);
			const b = blob.slice(start, end);

			const chunk = {
				__peerData: this._dataCount,
				n: index,
				data: b,
				total,
			};

			chunks.push(chunk);

			start = end;
			index++;
		}

		this._dataCount++;

		return chunks;
	}

	blobToArrayBuffer(
		blob: Blob,
		cb: (arg: ArrayBuffer | null) => void,
	): FileReader {
		const fr = new FileReader();

		fr.onload = function (evt) {
			if (evt.target) {
				cb(evt.target.result as ArrayBuffer);
			}
		};

		fr.readAsArrayBuffer(blob);

		return fr;
	}

	binaryStringToArrayBuffer(binary: string): ArrayBuffer | SharedArrayBuffer {
		const byteArray = new Uint8Array(binary.length);

		for (let i = 0; i < binary.length; i++) {
			byteArray[i] = binary.charCodeAt(i) & 0xff;
		}

		return byteArray.buffer;
	}

	randomToken(): string {
		return Math.random().toString(36).slice(2);
	}

	isSecure(): boolean {
		return location.protocol === "https:";
	}
}

/**
 * Provides a variety of helpful utilities.
 *
 * :::caution
 * Only the utilities documented here are guaranteed to be present on `util`.
 * Undocumented utilities can be removed without warning.
 * We don't consider these to be breaking changes.
 * :::
 */
export const util = new Util();
export function concatArrayBuffers(bufs: Uint8Array[]) {
	let size = 0;
	for (const buf of bufs) {
		size += buf.byteLength;
	}
	const result = new Uint8Array(size);
	let offset = 0;
	for (const buf of bufs) {
		result.set(buf, offset);
		offset += buf.byteLength;
	}
	return result;
}
