## Cold boot and saving a new snapshot

1. Go the `http://localhost:3000/vm/index.html?boot=true`

2. Once the boot is completed, clear the cache and start psql (the runtime assumes psql is running when it loads a snapshot):
 `echo 3 > /proc/sys/vm/drop_caches && echo 3 > /proc/sys/kernel/printk && reset && psql -U postgres`

3. Save the state to a file clicking the `Save state to file` button

4. Put the state file into the `state` folder and compress it using [zstd](https://github.com/facebook/zstd):

```bash
zstd --ultra -22 state/v86state.bin && rm state/v86state.bin
```
