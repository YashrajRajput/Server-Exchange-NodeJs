# Start the Server (main.js): 

node main.js


# Run the Client (client.js): 

node client.js


# Client Behavior:

The client will attempt to establish a connection with the server.
If the server is not yet available, the client will retry the connection every 2 seconds (or based on the configured retry interval).
Once connected, the client will start fetching data packets from the server.


# Output Generation:

As the client receives the data, it will process each packet and handle any missing sequences by requesting them from the server.
When all packets have been received, the client will generate an output.json file containing the data.
