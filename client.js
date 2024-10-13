const net = require("net");
const fs = require("fs");

const HOST = "localhost";
const PORT = 3000;

let receivedPackets = [];
let missingSequences = [];
let lastSequence = null;
let connectionClosed = false;
let maxRetries = 5;
let retryInterval = 3000;
let allPacketsReceived = false;
let uniquePackets = new Set();

function requestResendPacket(user, sequenceNumber) {
  const buffer = Buffer.alloc(2);
  buffer.writeUInt8(2, 0);
  buffer.writeUInt8(sequenceNumber, 1);
  user.write(buffer);
  console.log(`Requesting missing packet with sequence: ${sequenceNumber}`);
}

let user;

function connectToServer(retriesLeft) {
  user = new net.Socket();

  user.connect(PORT, HOST, () => {
    console.log("Connected to BetaCrew Exchange Server");

    const buffer = Buffer.alloc(2);
    buffer.writeUInt8(1, 0);
    buffer.writeUInt8(0, 1);
    user.write(buffer);
  });

  user.on("data", (data) => {
    let offset = 0;
    const packetSize = 17;

    while (offset < data.length) {
      const packet = data.slice(offset, offset + packetSize);
      const symbol = packet.toString("ascii", 0, 4);
      const buySellIndicator = packet.toString("ascii", 4, 5);
      const quantity = packet.readUInt32BE(5);
      const price = packet.readUInt32BE(9);
      const sequence = packet.readUInt32BE(13);

      const uniqueIdentifier = `${symbol}-${buySellIndicator}-${quantity}-${price}-${sequence}`;

      if (!uniquePackets.has(uniqueIdentifier)) {
        receivedPackets.push({
          symbol,
          buySellIndicator,
          quantity,
          price,
          sequence,
        });
        uniquePackets.add(uniqueIdentifier); // Mark this packet as seen
        console.log(`Received unique packet with sequence: ${sequence}`);
      }

      if (lastSequence !== null && sequence !== lastSequence + 1) {
        for (let seq = lastSequence + 1; seq < sequence; seq++) {
          console.log(`Missing sequence: ${seq}`);
          missingSequences.push(seq);
        }
      }

      lastSequence = sequence;
      offset += packetSize;
    }
  });

  user.on("close", () => {
    console.log("Connection closed by server");
    connectionClosed = true;
  });

  user.on("error", (err) => {
    console.error("Error:", err.message);

    if (retriesLeft > 0) {
      console.log(`Retrying connection... (${retriesLeft} retries left)`);
      setTimeout(() => {
        connectToServer(retriesLeft - 1);
      }, retryInterval);
    } else {
      console.log("Max retries reached. Exiting...");
    }
  });

  user.on("data", (data) => {
    let offset = 0;
    const packetSize = 17;

    while (offset < data.length) {
      const packet = data.slice(offset, offset + packetSize);
      const sequence = packet.readUInt32BE(13);

      if (missingSequences.includes(sequence)) {
        console.log(`Received missing packet with sequence: ${sequence}`);

        const symbol = packet.toString("ascii", 0, 4);
        const buySellIndicator = packet.toString("ascii", 4, 5);
        const quantity = packet.readUInt32BE(5);
        const price = packet.readUInt32BE(9);

        const uniqueIdentifier = `${symbol}-${buySellIndicator}-${quantity}-${price}-${sequence}`;

        if (!uniquePackets.has(uniqueIdentifier)) {
          receivedPackets.push({
            symbol,
            buySellIndicator,
            quantity,
            price,
            sequence,
          });
          uniquePackets.add(uniqueIdentifier); // Mark this packet as seen
        }
        missingSequences = missingSequences.filter((seq) => seq !== sequence);
      }

      offset += packetSize;
    }

    if (
      missingSequences.length === 0 &&
      connectionClosed &&
      !allPacketsReceived
    ) {
      console.log("All missing packets received, writing to JSON file.");
      allPacketsReceived = true;
      writeJsonFile();
      // user.destroy(); // Close the connection gracefully after writing
    }
  });

  user.on("end", () => {
    if (!allPacketsReceived) {
      console.log(
        "Connection ended but not all packets are received, trying again..."
      );
      connectToServer(maxRetries);
    }
  });
}

function writeJsonFile() {
  fs.writeFileSync("output.json", JSON.stringify(receivedPackets, null, 2));
  console.log("JSON file generated successfully: output.json");
}

connectToServer(maxRetries);
