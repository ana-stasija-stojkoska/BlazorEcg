using Microsoft.AspNetCore.SignalR;

namespace LiveEcgChart.Hubs
{
    public class EcgHub : Hub
    {
        public async Task AddToGroup(string groupName)
        {
            await Groups.AddToGroupAsync(Context.ConnectionId, groupName);
        }

        public async Task RemoveFromGroup(string groupName)
        {
            await Groups.RemoveFromGroupAsync(Context.ConnectionId, groupName);
        }

        public async Task SendEcgData(string groupName, int value)
        {
            await Clients.Group(groupName).SendAsync("ReceiveEcgData", value);
        }
    }
}
