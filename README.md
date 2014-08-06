# VK posts fetcher

This is a fairly simple command-line tool to fetch all posts from certain author(s) wall
in [VKontakte](https://vk.com) social network.
I needed it once for my personal usage, and decided to put it here in case
someone would have a similar need.

# Running
Make sure you have Node installed (duh). Then:
* Clone this repo with `git clone`
* Run `npm install` from root
* Once npm finishes, run `node vk-fetch-posts --authors [authors-ids] --group [group-id]`

The resulting posts will appear in `results` folder.

# Known issues
I didn't add much error handling, since this was
pretty much a one-time used tool. So this tool might fail ungracefully.
