// Runs once while the image is built and writes the files the container serves.
// Lobster has no network builtins, so it cannot be the HTTP server itself.
total := 0
for([3, 5, 8, 13]) x:
    total += x

body := "\{\"service\":\"lobster\",\"orders\":4,\"total\":" + total + "\}\n"
if not write_file("www/orders.json", body):
    print("could not write www/orders.json")
    return 1
if not write_file("www/health", "ok\n"):
    print("could not write www/health")
    return 1
