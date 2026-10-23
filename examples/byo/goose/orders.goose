// Runs once while the image is built and writes the files the container serves.
// Goose v2026.3 has no networking, so it cannot be the HTTP server itself.
import std;
import os;

fn main() {
    var total = 0;
    var count = 0;
    for x in [3, 5, 8, 13] { total += x; count++; }

    let body = str("{\"service\":\"goose\",\"orders\":", count, ",\"total\":", total, "}\n");
    guard write_file("www/orders.json", body) else {
        write_stderr("could not write www/orders.json\n");
        exit(1);
    }
    guard write_file("www/health", "ok\n") else {
        write_stderr("could not write www/health\n");
        exit(1);
    }
}
