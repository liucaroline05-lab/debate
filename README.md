# debate

AI Features
- organization
- matching debate partners

Pages
- Dashboard: Speeches uploaded, recent speeches, upcoming events, followed community channels, etc
- Record/Upload Speech: like the example
- Async Debate: like the example
- Resources: like the example
- Community: like the example


Reference Page: https://design-hub-pro.github.io/podium_app/dashboard.html




April 9, 2026

Community Page:
- A bigger new post button and also a persistent text box at the top of the page to encourage posting (e.g. YouTube comments style)
- Search tool at the top (e.g. Reddit style)
- Social buttons row needs improvement:
  - Like/Dislike, Favorites, Share, Comments, etc
  - Make them actual icons instead of emojis
  - Report button in the top right corner of each post via a ellipsis menu (three dots) that also includes options to edit or delete the post for the original poster
- Clicking a user's profile picture or name should take you to their profile page with their bio, list of their posts, and list of their debates, stats, etc. There should also be a follow button on their profile page to follow them and see their posts in your feed.
- Add a Saved tab alongside the existing All/Following

Profile Page:
- how many rounds you've won/lost, your win percentage, your average score, etc
- list of your debates with links to watch them
- More charts (e.g. bar, radar) and stats about your performance over time, your strengths and weaknesses in different topics, etc
- website user stats/events from Tabroom (API or webscraping); Tabroom account linking
- User profiles show which community channels they are active in and allow you to follow them to see their posts in your feed


Production-facing changes:
- move all the placeholder content to the firebase database and load it dynamically on the frontend, so that we can easily update it without changing the code


Visual Improvements Pass:
- Make add type buttons one line (e.g. + icon on the left and text on the right) and make them more visually appealing
- Settings: both the profile photo and Debate Preferences cards have a lot of unused vertical space. Make the profile photo card shorter and extend the height of the debate preference card and add stuff within to make use of the extra space (e.g. more settings options, or just move the save button up there and make it more prominent)
- Settings: the notification card needs to newline between the name and subtitle
- Settings: Account card's account type setting should a dropdown menu instead of a text input, and the options should be "Student" and "Coach"
- Settings: remove Session Status from the card
- Settings: Account card should have: Display name, email, Tabroom email, and Account Type
- Remove subtitle under header



Public-Facing Site:
- should look like the dashboard, but main content is covered by a login prompt (semi-transparent dark background behind the login popup; cannot click anything else on the page until you log in)



Resources Page:
- curated posts with attached media (images/video/etc)
- For each of the content cards, clicking them expands them to take the user to a new page dedicated to that specific topic
- Search and filters available




Settings Page Improvements:
- Profile photo card:
  - below the two buttons, include a multi-line textbox for the user to write whatever they want
  - make the debate preferences card shorter and use the reclaimed vertical space to give more room for the user bio
  - switch the two columns


Async Debate Page:
- If the user is participating in a debate, show the debate card at the top of the page with an option to listen to the other person's speech and a button to upload your own speech
- If the user is not participating in a debate, My Debates is empty but they can join via Open Challenges or Spectate an ongoing one.
- If they are participating in a debate but it is the other person's turn, it should have a status message about how they are waiting for the other person to upload their speech. There can also be a chat button that opens a chat window to communicate with the other person while they wait for them to upload their speech. The chat should be persistent and saved in the database so that they can come back to it later.
- Pressing the New Debate button should open a modal with a form to create a new debate. The form should include fields for the topic, the type of debate (e.g. Lincoln-Douglas, Public Forum, etc), and the time limit for each speech. There should also be an option for private to invite a specific user via a code to join the debate or make it open for anyone to join.
- Similar to the Community page, the public debates should have a like/dislike, favorite, share, and comment buttons. The comments should be persistent and saved in the database so that they can come back to it later. When a debate is still ongoing, the comments are not readable to the participants. Anyone can read but only spectators can comment. Once the debate is over, the comments are readable to everyone and anyone can comment. The comments should be sorted by most recent first.


Additional TODOs:
- When creating a new debate, instead of a modal it should be an inline form just like how it is done for making a new community post.
- Invite code text field style is out of place and should be fixed to match the rest of the form.
- The padding of a debate entry is nonexistent when there is turn metadata present. It should be padded the same as when there is no turn metadata. Also the chat button should still be visible as it current diappears when it should not.
- When there is a new chat message from the other debate partner, the chat button should have a notification badge to indicate that there is a new message. The badge should be a small red circle with a number indicating how many new messages there are.
- The async debate entries should look like [INSERT IMAGE EXAMPLE HERE]
- Community Page: add option to upload media (images, video, etc) to posts
  - Also option to upload other file types (e.g. PDF, Word, etc) to posts
- Follow button when looking at a user's profile currently does not work. It should add them to your following list and show their posts in your Following feed.
- Tabroom Sync is still broken. It should sync your Tabroom account with your debate account and pull in your stats, events, and other relevant information. This will require either an API or webscraping solution to get the data from Tabroom. There seems to be an official REST API: https://docs.debate.land/
- Dashboard: make the Events/Debate Threads/Resource Library/Channels cards not hardcoded and actually function.
- Community Page: make the Practice Groups/School & Tournament Channels listed on the right side real instead of hardcoded. At the top of the Practice Groups card, there should be a button to create a new practice group. Clicking it should open a modal with a form to create a new practice group. The form should include fields for the name, description, and an option to make it public or private. If it is private, there should be an option to invite specific users via a code to join the group. Visually it should be a green plus in the spot where the group icon would be and the name field should just say "Create Group"
- Within the Record/Upload page, the right side void should be filled by a list of the user's past speeches as well as others after their own. Each entry should have the same format as a Dashboard speech entry. Click it should go to a subpage where the user can view the speech, see comments, and download the speech. Comments can be disabled similar to the async debates. Default is comments on.