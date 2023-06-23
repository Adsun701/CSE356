import api from 'index'

function HomeScreen() { //SMALL MOCK UP of creating a home-screen with top 10 recently edited documents
    let docMap = none

    async function set10Docs() {
        let response = await api.get10Docs();
        if (response.data.success) {
            docMap = response.data.documents;
        }
    }
    set10Docs(); //assuming that the fetch api returns a hashmap of ({key:id, value: [name, yjsDoc]})

    if (!docMap) {
        return null;
    } else {
        return (
            <div
                className="document"
            >
                <div>
                    <form action="/collection/create" method="post" id="createDocument">
                        <h1>Create a new Document</h1>
                        <div class="nameField">
                            <label for="name">Name:</label>
                            <input type="text" id="name" name="name" placeholder="Enter document title" />
                        </div>
                        {/* you click the Create button, the form-data will be sent to a page called collection/create*/}
                        <button type="submit">Create</button>
                    </form>
                </div>
                Name:
                {
                    Object.keys(docMap).forEach(function (key, index) {
                        valueArray = docMap[key]; //getting the [name, yjsDoc] per key
                        docName = valueArray[0]; //getting document [name] in valueArray
                        <a
                            id={'document-' + index + '-link'}
                            className="document-link"
                            href={"/edit/" + key}>
                            {docName}
                        </a>
                    })
                }
            </div >
        )
    }
}

export default HomeScreen;

// documents.map((element, index) => {
                    //     if (index < 10) {
                    //         let id = element.key
                    //         let url = "/edit/" + id
                    //         //print out link for top 10 documents
                    //         //not yet completed
                    //     }
                    // })