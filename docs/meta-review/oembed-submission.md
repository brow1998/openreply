# Meta oEmbed Read: App Review submission

Everything needed to submit **Meta oEmbed Read** for the Meta app that powers
this deployment (app id `3554568898033114`, the same app as the Instagram login).
Nothing here has been sent to Meta: review the text, record the video, then paste.

## What changes in the product

`lib/meta/oembed.ts` calls `GET /instagram_oembed` with the app access token to
get the author, caption and cover of a post that someone forwarded into the
account's DMs. The Inbox uses it to draw that post as a card. Until the feature
is approved Meta answers with error #10 and the Inbox falls back to Instagram's
public embed, so nothing breaks while the review is pending.

Why it is needed: the Instagram Messaging API returns a forwarded post as a bare
link (`shares.data[0].link`) with no cover, author or caption. oEmbed is the only
supported way to turn that link into something a person can recognise.

## Where to submit

Meta for Developers → the app → **Analisar / App Review → Permissions and
features** → **Meta oEmbed Read** → *Request advanced access*. If the button is
missing, add the **oEmbed use case** first (Use cases → Add use cases →
"Embed content from Facebook, Instagram and Threads on other sites").

Requirements Meta lists for this feature: business verification (done), app
review (this document) and the data handling questions below.

## Use description (paste into "How will your app use this feature?")

> OpenReply is a self-hosted inbox that Instagram Business and Creator account
> owners use to read and answer their own comments and direct messages.
>
> When a person forwards an Instagram post or reel to the account owner in a
> direct message, the Instagram Messaging API gives us only the post's public
> link. We call the oEmbed endpoint (`instagram_oembed`) from our server with
> that single link to get the author name, caption and thumbnail, and we show
> them as a preview card inside the account owner's private inbox, so the owner
> can recognise what was shared without leaving the app.
>
> We only request oEmbed for links that already appear in the owner's own
> conversations, one request per distinct link, when the owner opens that
> conversation. We do not crawl, search or bulk-fetch posts, we do not store the
> response beyond a short in-memory cache (6 hours), we do not republish or show
> the content to anyone except the signed-in account owner, and we do not use it
> for advertising or profiling.

## Data handling answers (Data Use Checkup)

- **What data do you receive from this feature?** Public metadata of a single
  Instagram post: author username, caption/title and thumbnail URL.
- **Why do you need it?** To show the account owner a recognisable preview of a
  post that was forwarded to them in a DM.
- **Do you store it?** No database storage. A per-process in-memory cache keeps
  the response for up to 6 hours (30 minutes for refusals) and is lost on restart.
- **Do you share it with third parties?** No.
- **Who can see it?** Only members of the workspace that owns the conversation.
- **Data deletion:** Nothing persistent to delete; the workspace deletion flow
  described at `/data-deletion` covers the rest of the account data.
- **Policy URLs:** privacy `https://reply.useshelfie.com/privacy`, terms
  `https://reply.useshelfie.com/terms`, data deletion
  `https://reply.useshelfie.com/data-deletion`.

## Screencast (about 60 seconds, no audio needed, English captions help)

Record at 1280×720 or larger. **Use a conversation that contains only your own
accounts**: do not record real DMs from other people.

Setup (one minute, do it before recording): from the Instagram app, signed in as
`@usewatchfolio`, forward any public reel to `@sobrunoandrade`.

1. Show the sign-in page `reply.useshelfie.com/login` and sign in with the magic link.
2. Open **Inbox** and the conversation with `@usewatchfolio`.
3. Scroll to the forwarded reel. Point at the preview card (author, cover,
   caption). Caption on screen: "The Messaging API only gives us the link; oEmbed
   gives the preview."
4. Click **Open on Instagram** to show it opens the original public post.
5. Show **Settings** → connected accounts, to show the feature only runs for the
   owner's own connected account.

Meta accepts MP4 or MOV. If the recorder produces WebM, convert it:
`ffmpeg -i in.webm -c:v libx264 -pix_fmt yuv420p out.mp4`.

## Reviewer instructions (paste into "Testing instructions")

> Sign-in uses a one-time email link and is restricted to an allow-list, so we
> cannot hand reviewers a mailbox. The attached screencast shows the complete
> flow. To see the feature without our UI, call
> `GET https://graph.facebook.com/v25.0/instagram_oembed?url=<any public Instagram
> post or reel URL>&access_token=<app id>|<app secret>`; our server does exactly
> that once per forwarded link and renders the returned author, title and
> thumbnail.

## Before you press Submit

- [ ] Video recorded and converted to MP4.
- [ ] App icon (1024×1024), category and contact email set on the app (Settings → Basic).
- [ ] Privacy policy URL on the app points to a page that mentions Instagram data
      (the OpenReply one above does; confirm it is what the app shows today, since
      this app is shared with other projects).
- [ ] Data handling questions answered with the text above.
- [ ] The Pedro app's other permissions are untouched: this request only adds
      `Meta oEmbed Read`.
- [ ] Deployed build contains `lib/meta/oembed.ts` (it does from the commit that
      adds this file) and `FACEBOOK_APP_ID` / `FACEBOOK_APP_SECRET` are set.

## Honest risks

1. **It can be rejected.** oEmbed exists for embedding public posts on websites;
   a private inbox preview is outside the usual script. The description above
   stays truthful and narrow on purpose.
2. **Approval may not give a prettier card.** oEmbed's main output is the same
   embed HTML Instagram already serves. Author, caption and thumbnail are what the
   card in `components/message-content.tsx` uses; which of them Meta returns for
   Instagram is only knowable once approved.
3. **The app is shared.** A rejection or a policy question lands on the same app
   that handles Instagram login for other projects. Submitting from a dedicated
   app is cleaner, but the dedicated app cannot use Instagram Login (new apps only
   get the unified Facebook login), which is why this uses the existing one.
4. **Reviewers cannot sign in** (see instructions above). If they ask for a login,
   the fix is a temporary reviewer allow-list entry plus a mailbox they can read.
