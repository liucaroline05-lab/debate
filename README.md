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