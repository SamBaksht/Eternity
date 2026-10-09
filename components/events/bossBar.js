async function bossBarListener(bot) {
    bot.flayer.on('bossBarUpdated', (bossBar) => {
        console.log(`Boss Bar Title: ${bossBar.title}`);
        console.log(`Boss Bar Health: ${bossBar.health}`);
        console.log(`Boss Bar Color: ${bossBar.color}`);
        console.log(`Boss Bar Division: ${bossBar.division}`);
      });
}